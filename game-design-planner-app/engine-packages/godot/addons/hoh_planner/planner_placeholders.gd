@tool
extends RefCounted
## Placeholders for records whose texture or scene is not made yet: a square texture in the colour of the record's
## schema from the plan's palette (Art Direction, ir/engine-ir.json art.palette) with the record's initials, and a
## scene with a box (records with a footprint) or a capsule in that colour. They go to <root>/Placeholders/<Type>/ and
## carry the meta “hoh_placeholder”. Only empty properties are filled, so the real asset always wins; Validate still
## counts a placeholder as missing art.

const Bundle := preload("planner_bundle.gd")
const Importer := preload("planner_importer.gd")

const META := &"hoh_placeholder"
const SIZE := 64
## A 3×5 pixel font for the initials.
const GLYPHS := {
	"A": ["###", "#.#", "###", "#.#", "#.#"], "B": ["##.", "#.#", "##.", "#.#", "##."], "C": ["###", "#..", "#..", "#..", "###"],
	"D": ["##.", "#.#", "#.#", "#.#", "##."], "E": ["###", "#..", "##.", "#..", "###"], "F": ["###", "#..", "##.", "#..", "#.."],
	"G": ["###", "#..", "#.#", "#.#", "###"], "H": ["#.#", "#.#", "###", "#.#", "#.#"], "I": ["###", ".#.", ".#.", ".#.", "###"],
	"J": ["..#", "..#", "..#", "#.#", "###"], "K": ["#.#", "#.#", "##.", "#.#", "#.#"], "L": ["#..", "#..", "#..", "#..", "###"],
	"M": ["#.#", "###", "###", "#.#", "#.#"], "N": ["##.", "#.#", "#.#", "#.#", "#.#"], "O": ["###", "#.#", "#.#", "#.#", "###"],
	"P": ["###", "#.#", "###", "#..", "#.."], "Q": ["###", "#.#", "#.#", "###", "..#"], "R": ["##.", "#.#", "##.", "#.#", "#.#"],
	"S": ["###", "#..", "###", "..#", "###"], "T": ["###", ".#.", ".#.", ".#.", ".#."], "U": ["#.#", "#.#", "#.#", "#.#", "###"],
	"V": ["#.#", "#.#", "#.#", "#.#", ".#."], "W": ["#.#", "#.#", "###", "###", "#.#"], "X": ["#.#", "#.#", ".#.", "#.#", "#.#"],
	"Y": ["#.#", "#.#", ".#.", ".#.", ".#."], "Z": ["###", "..#", ".#.", "#..", "###"], "0": ["###", "#.#", "#.#", "#.#", "###"],
	"1": [".#.", "##.", ".#.", ".#.", "###"], "2": ["###", "..#", "###", "#..", "###"], "3": ["###", "..#", "###", "..#", "###"],
	"4": ["#.#", "#.#", "###", "..#", "..#"], "5": ["###", "#..", "###", "..#", "###"], "6": ["###", "#..", "###", "#.#", "###"],
	"7": ["###", "..#", "..#", "..#", "..#"], "8": ["###", "#.#", "###", "#.#", "###"], "9": ["###", "#.#", "###", "..#", "###"],
}


## A scene's metadata does not survive saving as .tscn, so the folder counts too.
static func is_placeholder(r: Variant) -> bool:
	return r is Resource and (r.has_meta(META) or r.resource_path.contains("/Placeholders/"))


static func palette(at: String) -> Array[Color]:
	var out: Array[Color] = []
	var ir: Variant = Bundle.read_json(at + "/ir/engine-ir.json")
	if ir is Dictionary:
		for c in ir.get("art", {}).get("palette", []):
			if Color.html_is_valid(str(c)):
				out.append(Color.html(str(c)))
	return out


## Up to two letters for a record key: item.iron_sword → IS, item.plank → PL.
static func initials(key: String) -> String:
	var last := key.get_slice(".", key.get_slice_count(".") - 1)
	var words := last.replace("-", "_").split("_", false)
	var text := (words[0][0] + words[1][0]) if words.size() >= 2 else last.substr(0, 2)
	return text.to_upper()


## FNV-1a, stable across runs and machines.
static func _hash(s: String) -> int:
	var h := 2166136261
	for b in s.to_utf8_buffer():
		h = ((h ^ b) * 16777619) & 0xFFFFFFFF
	return h


static func color_for(schema: String, key: String, colors: Array[Color]) -> Color:
	var base := colors[_hash(schema) % colors.size()] if not colors.is_empty() else Color.from_hsv(float(_hash(schema) % 360) / 360.0, 0.55, 0.8)
	return Color.from_hsv(base.h, base.s, clampf(base.v + float(_hash(key) % 7 - 3) * 0.06, 0.2, 0.95))


static func image(color: Color, text: String) -> Image:
	var img := Image.create(SIZE, SIZE, false, Image.FORMAT_RGBA8)
	img.fill(color.darkened(0.45))
	img.fill_rect(Rect2i(3, 3, SIZE - 6, SIZE - 6), color)
	var ink := Color(0.08, 0.08, 0.1) if color.get_luminance() > 0.55 else Color.WHITE
	var scale := 5
	var left := (SIZE - (text.length() * 4 * scale - scale)) / 2
	var top := (SIZE - 5 * scale) / 2
	for i in text.length():
		var rows: Array = GLYPHS.get(text[i], [])
		for r in rows.size():
			for c in 3:
				if rows[r][c] == "#":
					img.fill_rect(Rect2i(left + (i * 4 + c) * scale, top + r * scale, scale, scale), ink)
	return img


## Fills every empty Texture2D and PackedScene property of the record resources. Returns { made, filled }.
static func apply(at: String) -> Dictionary:
	var result := { "made": 0, "filled": 0 }
	var colors := palette(at)
	var resources := Importer.index(at)
	for pid in resources:
		var res: Resource = resources[pid]
		if res.has_meta(Importer.DEPRECATED):
			continue
		var key := str(res.get("id"))
		var schema := str(res.get_script().get_script_constant_map().get("SCHEMA_ID", ""))
		var type_name := str(res.get_script().get_global_name())
		var changed := false
		for p in res.get_property_list():
			if not (p["usage"] & PROPERTY_USAGE_SCRIPT_VARIABLE) or p["type"] != TYPE_OBJECT or res.get(p["name"]) != null:
				continue
			var cls := str(p["hint_string"])
			var made: Resource = null
			if cls == "Texture2D":
				made = _texture(at, type_name, key, color_for(schema, key, colors), result)
			elif cls == "PackedScene":
				made = _scene(at, type_name, key, color_for(schema, key, colors), res, result)
			if made != null:
				res.set(p["name"], made)
				result["filled"] += 1
				changed = true
		if changed:
			ResourceSaver.save(res, res.resource_path)
	return result


static func _texture(at: String, type_name: String, key: String, color: Color, result: Dictionary) -> Resource:
	var path := "%s/Placeholders/%s/%s.tres" % [at, type_name, Bundle.safe_file_name(key)]
	if FileAccess.file_exists(path):
		return load(path)
	DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	var tex := ImageTexture.create_from_image(image(color, initials(key)))
	tex.set_meta(META, true)
	if ResourceSaver.save(tex, path) != OK:
		return null
	result["made"] += 1
	return load(path)


static func _scene(at: String, type_name: String, key: String, color: Color, record: Resource, result: Dictionary) -> Resource:
	var path := "%s/Placeholders/%s/%s.tscn" % [at, type_name, Bundle.safe_file_name(key)]
	if FileAccess.file_exists(path):
		return load(path)
	DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	# A record with a footprint (buildings) is a box of that size; anything else a capsule, like a character.
	var footprint: Variant = record.get("footprint") if "footprint" in record else null
	var node := MeshInstance3D.new()
	node.name = key.replace(".", "_")
	if footprint is Vector2:
		var box := BoxMesh.new()
		box.size = Vector3(maxf(1.0, footprint.x), 1.0, maxf(1.0, footprint.y))
		node.mesh = box
	else:
		node.mesh = CapsuleMesh.new()
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	node.material_override = mat
	var packed := PackedScene.new()
	packed.pack(node)
	node.free()
	packed.set_meta(META, true)
	if ResourceSaver.save(packed, path) != OK:
		return null
	result["made"] += 1
	return load(path)
