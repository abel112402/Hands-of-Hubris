@tool
extends RefCounted
## A walkable prototype of every planned location (the export's Maps/*.json, format hoh-location): one scene per map in
## <root>/Greybox/ with a floor where the map is walkable, 2 m walls around it (with collision), doors (red when
## locked), lock and key markers, spawn points and the planned lights, at one unit per nav cell. A NavigationRegion3D
## covers it; bake it in the editor (it is not baked here). The scenes are generated: building again replaces them.

const Bundle := preload("planner_bundle.gd")
const Placeholders := preload("planner_placeholders.gd")

const FORMAT := "hoh-location"
const WALL := 2.0
const LETTERS := "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"


## Decodes a run-length encoded grid (a value is one letter A–z, a run its length then the letter); empty when malformed.
static func decode_rle(rle: String, length: int) -> PackedByteArray:
	var out := PackedByteArray()
	out.resize(length)
	var at := 0
	var count := ""
	for ch in rle:
		if ch >= "0" and ch <= "9":
			count += ch
			continue
		var v := LETTERS.find(ch)
		if v < 0:
			return PackedByteArray()
		var n := count.to_int() if count != "" else 1
		count = ""
		if at + n > length:
			return PackedByteArray()
		for i in n:
			out[at] = v
			at += 1
	return out if at == length else PackedByteArray()


## Builds every map's scene. Returns { scenes: Array of paths, notes: Array of String }.
static func build(at: String) -> Dictionary:
	var result := { "scenes": [], "notes": [] }
	var maps := Bundle.files_in(at + "/Maps", "json")
	if maps.is_empty():
		result["notes"].append("The export has no maps (Maps/): draw a location map in the planner and export again.")
		return result
	for file in maps:
		var map: Variant = Bundle.read_json(file)
		if not (map is Dictionary) or map.get("format") != FORMAT:
			continue
		var path := _build_one(at, map)
		if path.begins_with("res://"):
			result["scenes"].append(path)
		else:
			result["notes"].append("%s: %s" % [map.get("name", file.get_file()), path])
	return result


static func _material(color: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	# Both sides: a greybox is looked at from anywhere.
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	return m


static func _add(parent: Node, child: Node, owner: Node) -> Node:
	parent.add_child(child)
	child.owner = owner
	return child


## Quads (floor) and boxes (walls) merged into one mesh.
static func _mesh(quads: Array, boxes: Array) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for q in quads:
		_face(st, Vector3(q.x, 0, q.y), Vector3(q.x, 0, q.y + 1), Vector3(q.x + 1, 0, q.y + 1), Vector3(q.x + 1, 0, q.y))
	for b in boxes:
		var a := Vector3(b.x, 0, b.y)
		var c := Vector3(b.x + 1, WALL, b.y + 1)
		_face(st, Vector3(a.x, c.y, a.z), Vector3(a.x, c.y, c.z), Vector3(c.x, c.y, c.z), Vector3(c.x, c.y, a.z))
		_face(st, Vector3(a.x, a.y, a.z), Vector3(c.x, a.y, a.z), Vector3(c.x, c.y, a.z), Vector3(a.x, c.y, a.z))
		_face(st, Vector3(c.x, a.y, c.z), Vector3(a.x, a.y, c.z), Vector3(a.x, c.y, c.z), Vector3(c.x, c.y, c.z))
		_face(st, Vector3(a.x, a.y, c.z), Vector3(a.x, a.y, a.z), Vector3(a.x, c.y, a.z), Vector3(a.x, c.y, c.z))
		_face(st, Vector3(c.x, a.y, a.z), Vector3(c.x, a.y, c.z), Vector3(c.x, c.y, c.z), Vector3(c.x, c.y, a.z))
	st.generate_normals()
	return st.commit()


static func _face(st: SurfaceTool, v0: Vector3, v1: Vector3, v2: Vector3, v3: Vector3) -> void:
	# Godot's front faces wind clockwise seen from outside.
	for v in [v0, v1, v2, v0, v2, v3]:
		st.add_vertex(v)


static func _build_one(at: String, map: Dictionary) -> String:
	var nav: Dictionary = map.get("nav", {})
	var cell := float(nav.get("cell", 0))
	var cols := int(nav.get("cols", 0))
	var rows := int(nav.get("rows", 0))
	if cell <= 0 or cols <= 0 or rows <= 0:
		return "no nav grid"
	var cost := decode_rle(str(nav.get("cost", "")), cols * rows)
	var tags := decode_rle(str(nav.get("tags", "")), cols * rows)
	if cost.is_empty() or tags.is_empty():
		return "the nav grid cannot be read"
	var walkable := func(c: int, r: int) -> bool: return c >= 0 and r >= 0 and c < cols and r < rows and cost[r * cols + c] > 0
	var pos := func(x: float, y: float, h: float) -> Vector3: return Vector3(x / cell, h, y / cell)
	var colors := Placeholders.palette(at)

	var root := Node3D.new()
	root.name = "Greybox " + str(map.get("name", "map"))
	var quads: Array = []
	var boxes: Array = []
	for r in rows:
		for c in cols:
			if walkable.call(c, r):
				quads.append(Vector2(c, r))
			elif walkable.call(c - 1, r) or walkable.call(c + 1, r) or walkable.call(c, r - 1) or walkable.call(c, r + 1):
				boxes.append(Vector2(c, r))
	var region := NavigationRegion3D.new()
	region.name = "Navigation"
	region.navigation_mesh = NavigationMesh.new()
	_add(root, region, root)
	for part in [["Floor", _mesh(quads, []), colors[3] if colors.size() > 3 else Color(0.7, 0.7, 0.7)], ["Walls", _mesh([], boxes), colors[0] if colors.size() > 0 else Color(0.35, 0.35, 0.4)]]:
		var body := StaticBody3D.new()
		body.name = part[0]
		_add(region, body, root)
		var mesh := MeshInstance3D.new()
		mesh.name = "Mesh"
		mesh.mesh = part[1]
		mesh.material_override = _material(part[2])
		_add(body, mesh, root)
		var shape := CollisionShape3D.new()
		shape.name = "Shape"
		shape.shape = part[1].create_trimesh_shape()
		_add(body, shape, root)

	var doors := _add(root, Node3D.new(), root)
	doors.name = "Doors"
	var door_mat := _material(Color(0.55, 0.36, 0.2))
	var locked_mat := _material(Color(0.8, 0.15, 0.15))
	for r in rows:
		for c in cols:
			var t := tags[r * cols + c]
			if (t & 2) == 0:
				continue
			var door := MeshInstance3D.new()
			var locked := (t & 4) != 0
			door.name = "LockedDoor" if locked else "Door"
			var box := BoxMesh.new()
			box.size = Vector3(1, WALL, 1)
			door.mesh = box
			door.material_override = locked_mat if locked else door_mat
			door.position = Vector3(c + 0.5, WALL / 2, r + 0.5)
			door.transparency = 0.5
			_add(doors, door, root)

	var markers := _add(root, Node3D.new(), root)
	markers.name = "Markers"
	var entrance: Variant = null
	for kind in [["locks", "lock", "Lock", locked_mat], ["keys", "key", "Key", _material(Color(0.95, 0.8, 0.2))]]:
		for m in map.get(kind[0], []):
			var node := MeshInstance3D.new()
			node.name = "%s_%s" % [kind[2], str(m.get(kind[1], "")).validate_node_name()]
			var box := BoxMesh.new()
			box.size = Vector3.ONE * 0.4
			node.mesh = box
			node.material_override = kind[3]
			node.position = pos.call(float(m.get("x", 0)), float(m.get("y", 0)), 0.5)
			_add(markers, node, root)
	var spawn_mat := _material(colors[1] if colors.size() > 1 else Color(0.95, 0.6, 0.3))
	for s in map.get("spawns", []):
		var role := str(s.get("role", "spawn"))
		var node := MeshInstance3D.new()
		node.name = ("Spawn_%s_%s" % [role, str(s.get("label", ""))]).validate_node_name()
		node.mesh = CapsuleMesh.new()
		node.material_override = spawn_mat
		node.position = pos.call(float(s.get("x", 0)), float(s.get("y", 0)), 1.0)
		node.set_meta("spawn_role", role)
		node.set_meta("spawn_count", int(s.get("count", 1)))
		if entrance == null or role in ["entrance", "player"]:
			entrance = node.position
		_add(markers, node, root)

	var lights := _add(root, Node3D.new(), root)
	lights.name = "Lights"
	for l in map.get("lights", []):
		var light := OmniLight3D.new()
		light.name = "Light"
		light.position = pos.call(float(l.get("x", 0)), float(l.get("y", 0)), WALL * 1.25)
		light.omni_range = maxf(1.0, float(l.get("radius", cell * 4)) / cell)
		light.light_energy = maxf(0.5, float(l.get("intensity", 1)))
		if Color.html_is_valid(str(l.get("color", ""))):
			light.light_color = Color.html(str(l.get("color")))
		_add(lights, light, root)
	var sun := DirectionalLight3D.new()
	sun.name = "Sun"
	sun.rotation_degrees = Vector3(-50, -30, 0)
	_add(root, sun, root)
	var cam := Camera3D.new()
	cam.name = "Camera"
	var look: Vector3 = entrance if entrance != null else Vector3(cols / 2.0, 0, rows / 2.0)
	var eye := look + Vector3(0, 12, 8)
	# look_at needs the node in a scene tree; the basis can be set directly.
	cam.transform = Transform3D(Basis.looking_at(look - eye, Vector3.UP), eye)
	_add(root, cam, root)

	var path := "%s/Greybox/%s.tscn" % [at, Bundle.safe_file_name(str(map.get("name", "map")).replace(" ", "_"))]
	DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	var packed := PackedScene.new()
	var err := packed.pack(root)
	root.free()
	if err != OK:
		return "could not pack the scene (%s)" % error_string(err)
	err = ResourceSaver.save(packed, path)
	return path if err == OK else "could not save %s (%s)" % [path, error_string(err)]
