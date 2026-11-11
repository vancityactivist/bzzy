#include "protocol.h"

#include <ArduinoJson.h>

namespace bzzy {

static void copyText(char* dst, const char* src) {
  if (!src) {
    dst[0] = '\0';
    return;
  }
  strlcpy(dst, src, kTextMax);
}

bool parseState(const char* json, size_t len, State& out) {
  JsonDocument doc;
  if (deserializeJson(doc, json, len)) return false;
  if ((doc["v"] | 0) != 1) return false;

  State st;
  st.lastSync = doc["serverTime"] | 0u;
  parseStatus(doc["defaultStatus"] | "free", st.defaultStatus);

  JsonObjectConst m = doc["manual"];
  if (!m.isNull()) {
    st.manual.active = m["active"] | true;
    parseStatus(m["status"] | "busy", st.manual.status);
    copyText(st.manual.text, m["text"] | "");
    st.manual.until = m["until"] | 0u;
    st.manual.updatedAt = m["updatedAt"] | 0u;
    st.manual.local = m["local"] | false;  // only set in the on-device cache
  }

  for (JsonObjectConst b : doc["schedule"].as<JsonArrayConst>()) {
    if (st.blockCount >= kMaxBlocks) break;
    Block& blk = st.blocks[st.blockCount];
    blk.start = b["start"] | 0u;
    blk.end = b["end"] | 0u;
    if (blk.end <= blk.start) continue;
    parseStatus(b["status"] | "busy", blk.status);
    copyText(blk.text, b["text"] | "");
    st.blockCount++;
  }

  out = st;
  return true;
}

String serializeState(const State& st) {
  JsonDocument doc;
  doc["v"] = 1;
  doc["serverTime"] = st.lastSync;
  doc["defaultStatus"] = statusName(st.defaultStatus);
  if (st.manual.active || st.manual.updatedAt) {
    JsonObject m = doc["manual"].to<JsonObject>();
    m["active"] = st.manual.active;
    m["status"] = statusName(st.manual.status);
    m["text"] = st.manual.text;
    m["until"] = st.manual.until;
    m["updatedAt"] = st.manual.updatedAt;
    m["local"] = st.manual.local;
  }
  JsonArray arr = doc["schedule"].to<JsonArray>();
  for (size_t i = 0; i < st.blockCount; ++i) {
    JsonObject b = arr.add<JsonObject>();
    b["start"] = st.blocks[i].start;
    b["end"] = st.blocks[i].end;
    b["status"] = statusName(st.blocks[i].status);
    b["text"] = st.blocks[i].text;
  }
  String out;
  serializeJson(doc, out);
  return out;
}

}  // namespace bzzy
