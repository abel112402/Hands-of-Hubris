/** A binary min-heap of numbers (cell or state indices); each entry keeps the key it was pushed with. */
export class MinHeap {
  private items: [number, number][] = []
  get size() {
    return this.items.length
  }
  push(value: number, key: number) {
    const a = this.items
    a.push([key, value])
    for (let k = a.length - 1; k > 0; ) {
      const p = (k - 1) >> 1
      if (a[p][0] <= a[k][0]) break
      ;[a[p], a[k]] = [a[k], a[p]]
      k = p
    }
  }
  /** The entry with the smallest key, as [key, value]. */
  pop(): [number, number] {
    const a = this.items
    const top = a[0]
    const last = a.pop()!
    if (a.length) {
      a[0] = last
      for (let k = 0; ; ) {
        const [l, r] = [k * 2 + 1, k * 2 + 2]
        let m = k
        if (l < a.length && a[l][0] < a[m][0]) m = l
        if (r < a.length && a[r][0] < a[m][0]) m = r
        if (m === k) break
        ;[a[m], a[k]] = [a[k], a[m]]
        k = m
      }
    }
    return top
  }
}
