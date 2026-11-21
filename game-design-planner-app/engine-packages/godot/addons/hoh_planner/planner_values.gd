@tool
extends RefCounted
## Writes planner record values (JSON) into a record resource's properties. A null or empty planner value never clears
## a property, so the textures, scenes and numbers set by hand in the Inspector survive a reimport.

## to_value() returns this when the property should be left as it is.
const KEEP := &"__hoh_keep__"


## Sets every property the record names. ctx: { "enums": {CONST_IDS: {id: value}}, "by_class": {ClassName: schema id},
## "resolve": Callable(schema_id: String, key: String) -> Resource }. Returns problems as readable lines.
static func apply(res: Resource, record: Dictionary, fields: Dictionary, ctx: Dictionary) -> PackedStringArray:
	var problems := PackedStringArray()
	var props := {}
	for p in res.get_property_list():
		if p["usage"] & PROPERTY_USAGE_SCRIPT_VARIABLE:
			props[p["name"]] = p
	if record.has("id"):
		res.set("id", str(record["id"]))
	if record.has("plannerId"):
		res.set("planner_id", str(record["plannerId"]))
	for planner in record:
		if planner == "id" or planner == "plannerId":
			continue
		var prop: String = fields.get(planner, "")
		if prop == "" or not props.has(prop):
			problems.append("%s: no property for it in %s; export the plan again" % [planner, res.get_script().get_global_name()])
			continue
		var info: Dictionary = props[prop]
		var r := to_value(record[planner], info, res.get(prop), ctx)
		if r.has("problem"):
			problems.append("%s: %s" % [planner, r["problem"]])
		if not is_keep(r["value"]):
			res.set(prop, r["value"])
	return problems


static func is_keep(v: Variant) -> bool:
	return v is StringName and v == KEEP


static func _keep(problem: String = "") -> Dictionary:
	return {"value": KEEP, "problem": problem} if problem != "" else {"value": KEEP}


## One JSON value as a value of the property's type. info is the property's entry from get_property_list().
static func to_value(v: Variant, info: Dictionary, current: Variant, ctx: Dictionary) -> Dictionary:
	if v == null or (v is String and v == ""):
		return _keep()
	var type := int(info["type"])
	match type:
		TYPE_STRING, TYPE_STRING_NAME:
			return {"value": v if v is String else JSON.stringify(v)}
		TYPE_INT:
			if v is String:
				return _enum_value(v, info, ctx)
			if v is float or v is int:
				return {"value": int(v)}
		TYPE_FLOAT:
			if v is float or v is int:
				return {"value": float(v)}
		TYPE_BOOL:
			if v is bool:
				return {"value": v}
		TYPE_COLOR:
			if v is String and Color.html_is_valid(v):
				return {"value": Color.html(v)}
			return _keep("“%s” is not a colour like #aabbcc" % str(v))
		TYPE_VECTOR2, TYPE_VECTOR3:
			var need := 2 if type == TYPE_VECTOR2 else 3
			if not (v is Array) or v.size() != need:
				return _keep("needs %d numbers" % need)
			return {"value": Vector2(v[0], v[1]) if need == 2 else Vector3(v[0], v[1], v[2])}
		TYPE_ARRAY:
			return _array(v, current, ctx)
		TYPE_OBJECT:
			return _object(str(v), str(info.get("hint_string", "")) if str(info.get("class_name", "")) == "" else str(info["class_name"]), ctx)
	return _keep("“%s” cannot be read as %s" % [str(v), type_string(type)])


## A planner ID (e.g. “common”) as an enum value, through the generated *_IDS tables.
static func _enum_value(id: String, info: Dictionary, ctx: Dictionary) -> Dictionary:
	var enums: Dictionary = ctx.get("enums", {})
	var cls := str(info.get("class_name", ""))
	if cls.contains("."):
		var table := cls.get_slice(".", cls.get_slice_count(".") - 1).to_snake_case().to_upper() + "_IDS"
		if enums.has(table) and enums[table].has(id):
			return {"value": int(enums[table][id])}
	for t in enums:
		if enums[t].has(id):
			return {"value": int(enums[t][id])}
	if id.is_valid_int():
		return {"value": int(id)}
	return _keep("“%s” is not a value of the enum" % id)


static func _object(text: String, cls: String, ctx: Dictionary) -> Dictionary:
	var by_class: Dictionary = ctx.get("by_class", {})
	if by_class.has(cls):
		var target: Resource = ctx["resolve"].call(by_class[cls], text)
		return {"value": target} if target != null else _keep("no %s record “%s”" % [cls, text])
	if not text.begins_with("res://") and not text.begins_with("uid://"):
		return _keep("“%s” is not a resource path; assign it in the Inspector" % text)
	if not ResourceLoader.exists(text):
		return _keep("no resource at “%s”; assign it in the Inspector" % text)
	return {"value": load(text)}


static func _array(v: Variant, current: Variant, ctx: Dictionary) -> Dictionary:
	if not (v is Array):
		return _keep("should be a list")
	var out: Array = current.duplicate() if current is Array else []
	out.clear()
	var builtin := out.get_typed_builtin() if out.is_typed() else TYPE_NIL
	var script: Script = out.get_typed_script() if out.is_typed() else null
	var cls := str(script.get_global_name()) if script != null else (str(out.get_typed_class_name()) if out.is_typed() else "")
	if v.is_empty() and builtin == TYPE_OBJECT:
		return _keep()
	var problem := ""
	for item in v:
		if builtin == TYPE_NIL:
			out.append(item)
			continue
		var r := to_value(item, {"type": builtin, "class_name": cls}, null, ctx)
		if r.has("problem"):
			problem = r["problem"]
		if not is_keep(r["value"]):
			out.append(r["value"])
	return {"value": out, "problem": problem} if problem != "" else {"value": out}
