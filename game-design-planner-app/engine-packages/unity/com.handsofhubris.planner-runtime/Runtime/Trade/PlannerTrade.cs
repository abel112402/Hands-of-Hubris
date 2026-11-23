using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace HoHPlanner.Runtime
{
    /// <summary>An item and its price in the base unit.</summary>
    [Serializable]
    public struct PlannerPrice
    {
        public string ItemId;
        [Min(0)] public int Price;

        public PlannerPrice(string itemId, int price)
        {
            ItemId = itemId;
            Price = price;
        }
    }

    /// <summary>Something was bought or sold (on the runtime's event bus).</summary>
    public readonly struct PlannerTraded
    {
        public readonly string MerchantId;
        public readonly string ItemId;
        /// <summary>True when the player bought it.</summary>
        public readonly bool Bought;
        public readonly int Price;

        public PlannerTraded(string merchantId, string itemId, bool bought, int price)
        {
            MerchantId = merchantId;
            ItemId = itemId;
            Bought = bought;
            Price = price;
        }
    }

    /// <summary>
    /// The “trade” module (phase 20, after “interaction” and “inventory”): the player's wallet in the base unit (starting
    /// money, an optional limit) that quests' Reward money fills, and trading with <see cref="PlannerMerchant"/>s: buying
    /// one of its goods takes the price and adds the item (only when both fit), selling one takes the item and pays the
    /// price (only while the merchant has money for buying and the wallet has room). Saved as
    /// <see cref="PlannerStateKind.Trade"/> (the money, and what each merchant can still pay).
    /// </summary>
    [AddComponentMenu("Game Design Planner/Planner Trade")]
    public sealed class PlannerTrade : MonoBehaviour, IPlannerService
    {
        public PlannerInventory Inventory;
        [Min(0)] public int StartMoney;
        [Tooltip("The most money the player can carry; 0: no limit.")]
        [Min(0)] public int WalletCap;
        [Tooltip("Show the money on screen.")]
        public bool ShowOnScreen = true;

        PlannerRuntime runtime;
        IDisposable subscription;

        public string Id => "trade";
        public IReadOnlyList<string> DependsOn => new[] { "interaction", "inventory" };
        public int Money { get; private set; }
        /// <summary>The merchant whose panel is open, or null.</summary>
        public PlannerMerchant Open { get; private set; }
        public event Action Changed;

        static PlannerMerchant[] Merchants() => FindObjectsByType<PlannerMerchant>(FindObjectsInactive.Include, FindObjectsSortMode.None);

        public void Initialize(PlannerRuntime runtime)
        {
            if (Inventory == null) throw new InvalidOperationException("Trade cannot start: no inventory.");
            var problems = Merchants().SelectMany(m => m.Sells.Concat(m.Buys).Where(o => Inventory.Def(o.ItemId) == null).Select(o => $"{m.Name} trades “{o.ItemId}”, which the inventory does not know")).Distinct().ToList();
            if (problems.Count > 0) throw new InvalidOperationException("Trade cannot start: " + string.Join("; ", problems) + ".");
            this.runtime = runtime;
            Money = Fit(StartMoney);
            subscription = runtime.Events.Subscribe<PlannerQuestCompleted>(q => AddMoney(q.Money));
        }

        public void Shutdown()
        {
            subscription?.Dispose();
            subscription = null;
            runtime = null;
            Open = null;
        }

        int Fit(int money) => WalletCap > 0 ? Mathf.Min(money, WalletCap) : money;

        /// <summary>Adds money up to the wallet limit (what does not fit is lost).</summary>
        public void AddMoney(int amount)
        {
            if (runtime == null || amount <= 0) return;
            Money = Fit(Money + amount);
            Changed?.Invoke();
        }

        public void OpenPanel(PlannerMerchant m)
        {
            Open = m;
            Changed?.Invoke();
        }

        public void Close()
        {
            Open = null;
            Changed?.Invoke();
        }

        /// <summary>Whether the player can buy the item from the merchant now, and why not.</summary>
        public bool CanBuy(PlannerMerchant m, string itemId, out string reason)
        {
            reason = null;
            var offer = m.Sells.FirstOrDefault(o => o.ItemId == itemId);
            if (runtime == null) reason = "not running";
            else if (offer.ItemId == null) reason = $"{m.Name} does not sell it";
            else if (Money < offer.Price) reason = $"needs {offer.Price} (have {Money})";
            else if (!Inventory.CanAddAll(new[] { new PlannerItemAmount(itemId, 1) })) reason = "no room";
            return reason == null;
        }

        /// <summary>Whether the merchant buys the item from the player now, and why not.</summary>
        public bool CanSell(PlannerMerchant m, string itemId, out string reason)
        {
            reason = null;
            var offer = m.Buys.FirstOrDefault(o => o.ItemId == itemId);
            if (runtime == null) reason = "not running";
            else if (offer.ItemId == null) reason = $"{m.Name} does not buy it";
            else if (Inventory.CountOf(itemId) < 1) reason = "you have none";
            else if (m.Gold >= 0 && m.Gold < offer.Price) reason = $"{m.Name} has only {m.Gold}";
            else if (WalletCap > 0 && Money + offer.Price > WalletCap) reason = "your purse is full";
            return reason == null;
        }

        public bool Buy(PlannerMerchant m, string itemId)
        {
            if (!CanBuy(m, itemId, out _)) return false;
            var price = m.Sells.First(o => o.ItemId == itemId).Price;
            if (!Inventory.TryAdd(itemId, 1)) return false;
            Money -= price;
            if (m.Gold >= 0) m.Gold += price;
            runtime.Events.Publish(new PlannerTraded(m.MerchantId, itemId, true, price));
            runtime.Events.Publish(new PlannerItemAcquired(itemId, Inventory.Def(itemId)?.Key, 1, "merchant:" + m.MerchantId));
            Changed?.Invoke();
            return true;
        }

        public bool Sell(PlannerMerchant m, string itemId)
        {
            if (!CanSell(m, itemId, out _)) return false;
            var price = m.Buys.First(o => o.ItemId == itemId).Price;
            if (!Inventory.TryExchange(new[] { new PlannerItemAmount(itemId, 1) }, Array.Empty<PlannerItemAmount>())) return false;
            Money += price;
            if (m.Gold >= 0) m.Gold -= price;
            runtime.Events.Publish(new PlannerTraded(m.MerchantId, itemId, false, price));
            Changed?.Invoke();
            return true;
        }

        [Serializable]
        public sealed class MerchantGold
        {
            public string merchant;
            public int gold;
        }

        [Serializable]
        public sealed class State
        {
            public int money;
            public List<MerchantGold> merchants = new List<MerchantGold>();
        }

        public State CaptureState() => new State { money = Money, merchants = Merchants().OrderBy(m => m.MerchantId, StringComparer.Ordinal).Select(m => new MerchantGold { merchant = m.MerchantId, gold = m.Gold }).ToList() };

        public void CheckState(State s)
        {
            if (s.money < 0 || (WalletCap > 0 && s.money > WalletCap)) throw new PlannerStateException($"The saved money {s.money} does not fit this plan.");
            var known = Merchants().Select(m => m.MerchantId).ToList();
            var unknown = (s.merchants ?? new List<MerchantGold>()).Where(x => !known.Contains(x.merchant)).Select(x => x.merchant).ToList();
            if (unknown.Count > 0) throw new PlannerStateException($"The save has merchants that are not in this game: {string.Join(", ", unknown)}.");
        }

        public void RestoreState(State s)
        {
            CheckState(s);
            Money = s.money;
            foreach (var m in Merchants())
            {
                var saved = (s.merchants ?? new List<MerchantGold>()).FirstOrDefault(x => x.merchant == m.MerchantId);
                m.Gold = saved != null ? saved.gold : m.StartGold;
            }
            Open = null;
            Changed?.Invoke();
        }

        void OnGUI()
        {
            if (runtime == null) return;
            if (ShowOnScreen) GUI.Label(new Rect(20f, 68f, 400f, 22f), $"Money: {Money}");
            var m = Open;
            if (m == null) return;
            var width = Mathf.Min(560f, Screen.width - 40f);
            GUILayout.BeginArea(new Rect((Screen.width - width) / 2f, Screen.height * 0.2f, width, Screen.height * 0.6f), m.Name + (m.Gold >= 0 ? $" (can pay {m.Gold})" : ""), GUI.skin.window);
            GUILayout.Label($"Your money: {Money}");
            foreach (var o in m.Sells)
            {
                var name = Inventory.Def(o.ItemId)?.Name ?? o.ItemId;
                GUI.enabled = CanBuy(m, o.ItemId, out var why);
                if (GUILayout.Button(GUI.enabled ? $"Buy {name} for {o.Price}" : $"Buy {name} for {o.Price} ({why})")) Buy(m, o.ItemId);
            }
            foreach (var o in m.Buys)
            {
                var name = Inventory.Def(o.ItemId)?.Name ?? o.ItemId;
                GUI.enabled = CanSell(m, o.ItemId, out var why);
                if (GUILayout.Button(GUI.enabled ? $"Sell {name} for {o.Price}" : $"Sell {name} for {o.Price} ({why})")) Sell(m, o.ItemId);
            }
            GUI.enabled = true;
            if (GUILayout.Button("Leave")) Close();
            GUILayout.EndArea();
        }
    }
}
