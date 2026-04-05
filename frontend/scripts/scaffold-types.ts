// Pure type-mapping functions extracted from scaffold-client.ts for testability.
// No Node.js imports (fs, path, url) so these can be tested with vitest.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDef = any;

export function getPrimitiveLabel(prim: AnyDef): string {
  if (prim.isNull) return "null";
  if (prim.isBool) return "bool";
  if (prim.isChar) return "char";
  if (prim.isStr) return "str";
  if (prim.isU8) return "u8";
  if (prim.isU16) return "u16";
  if (prim.isU32) return "u32";
  if (prim.isU64) return "u64";
  if (prim.isU128) return "u128";
  if (prim.isI8) return "i8";
  if (prim.isI16) return "i16";
  if (prim.isI32) return "i32";
  if (prim.isI64) return "i64";
  if (prim.isI128) return "i128";
  if (prim.isActorId) return "actor_id";
  if (prim.isCodeId) return "code_id";
  if (prim.isMessageId) return "message_id";
  if (prim.isH256) return "h256";
  if (prim.isU256) return "u256";
  if (prim.isH160) return "h160";
  if (prim.isNonZeroU8) return "NonZeroU8";
  if (prim.isNonZeroU16) return "NonZeroU16";
  if (prim.isNonZeroU32) return "NonZeroU32";
  if (prim.isNonZeroU64) return "NonZeroU64";
  if (prim.isNonZeroU128) return "NonZeroU128";
  if (prim.isNonZeroU256) return "NonZeroU256";
  return "unknown";
}

export function getTypeLabel(def: AnyDef): string {
  if (!def) return "unknown";
  if (def.isPrimitive) return getPrimitiveLabel(def.asPrimitive);
  if (def.isOptional) return `opt ${getTypeLabel(def.asOptional.def)}`;
  if (def.isVec) return `vec ${getTypeLabel(def.asVec.def)}`;
  if (def.isStruct) {
    const fields = def.asStruct.fields
      .map((f: AnyDef) => `${f.name}: ${getTypeLabel(f.def)}`)
      .join(", ");
    return `{ ${fields} }`;
  }
  if (def.isEnum) {
    return def.asEnum.variants.map((v: AnyDef) => v.name).join(" | ");
  }
  if (def.isResult) {
    return `result<${getTypeLabel(def.asResult.ok.def)}, ${getTypeLabel(def.asResult.err.def)}>`;
  }
  if (def.isMap) {
    return `map<${getTypeLabel(def.asMap.key.def)}, ${getTypeLabel(def.asMap.value.def)}>`;
  }
  if (def.isFixedSizeArray) {
    return `[${getTypeLabel(def.asFixedSizeArray.def)}; ${def.asFixedSizeArray.len}]`;
  }
  if (def.isUserDefined) return def.asUserDefined.name;
  return "unknown";
}

export function primToTs(prim: AnyDef): string {
  if (prim.isStr || prim.isChar) return "string";
  if (prim.isBool) return "boolean";
  if (prim.isNull) return "null";
  if (prim.isU8 || prim.isU16 || prim.isU32 || prim.isI8 || prim.isI16 || prim.isI32) return "number";
  if (prim.isNonZeroU8 || prim.isNonZeroU16 || prim.isNonZeroU32) return "number";
  if (prim.isU64 || prim.isU128 || prim.isU256 || prim.isI64 || prim.isI128) return "string";
  if (prim.isNonZeroU64 || prim.isNonZeroU128 || prim.isNonZeroU256) return "string";
  if (prim.isActorId || prim.isCodeId || prim.isMessageId || prim.isH256 || prim.isH160) return "string";
  return "unknown";
}

export function getTsType(def: AnyDef): string {
  if (!def) return "unknown";
  if (def.isPrimitive) return primToTs(def.asPrimitive);
  if (def.isOptional) {
    const inner = getTsType(def.asOptional.def);
    return inner.includes("|") || inner.includes("{") ? `(${inner}) | null` : `${inner} | null`;
  }
  if (def.isVec) {
    const inner = getTsType(def.asVec.def);
    return inner.includes("|") || inner.includes("{") ? `(${inner})[]` : `${inner}[]`;
  }
  if (def.isStruct) {
    const fields = def.asStruct.fields
      .map((f: AnyDef) => `${f.name}: ${getTsType(f.def)}`)
      .join("; ");
    return `{ ${fields} }`;
  }
  if (def.isEnum) {
    const hasPayloads = def.asEnum.variants.some((v: AnyDef) => v.def && !v.def.isNull);
    if (hasPayloads) return "unknown";
    return def.asEnum.variants.map((v: AnyDef) => `"${v.name}"`).join(" | ");
  }
  if (def.isResult || def.isMap) return "unknown";
  if (def.isFixedSizeArray) {
    const inner = getTsType(def.asFixedSizeArray.def);
    return inner.includes("|") || inner.includes("{") ? `(${inner})[]` : `${inner}[]`;
  }
  if (def.isUserDefined) return "unknown";
  return "unknown";
}

export function methodIcon(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("message") || lower.includes("send") || lower.includes("chat")) return "ChatText";
  if (lower.includes("ping") || lower.includes("schedule") || lower.includes("delay")) return "Clock";
  if (lower.includes("greeting") || lower.includes("set")) return "PencilSimple";
  if (lower.includes("increment") || lower.includes("count") || lower.includes("add")) return "PlusCircle";
  return "ArrowUp";
}

export function isSmallNumeric(typeLabel: string): boolean {
  return ["u8", "u16", "u32", "i8", "i16", "i32"].includes(typeLabel);
}

export function isBigNumeric(typeLabel: string): boolean {
  return ["u64", "u128", "u256", "i64", "i128"].includes(typeLabel);
}

export function isHexType(typeLabel: string): boolean {
  return ["actor_id", "code_id", "message_id", "h256", "h160"].includes(typeLabel);
}

export function defaultValueStr(typeLabel: string): string {
  if (typeLabel === "bool") return "false";
  if (typeLabel === "str" || typeLabel === "char") return '""';
  if (isSmallNumeric(typeLabel)) return "0";
  if (isBigNumeric(typeLabel)) return '"0"';
  if (isHexType(typeLabel)) return '""';
  return '""';
}
