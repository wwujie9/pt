export function decodeXml(value = "") {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

export function readTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(stripCdata(match[1].trim())) : "";
}

export function readItems(xml) {
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);
}

export function readTorznabAttrs(itemXml) {
  const attrs = {};
  for (const match of itemXml.matchAll(/<torznab:attr\s+name="([^"]+)"\s+value="([^"]*)"\s*\/?>/gi)) {
    attrs[match[1]] = decodeXml(match[2]);
  }
  return attrs;
}

function stripCdata(value) {
  return value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}
