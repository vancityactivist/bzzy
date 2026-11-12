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

  JsonObjectConst sh = doc["show"];
  if (!sh.isNull()) {
    st.show.active = sh["active"] | false;
    copyText(st.show.text, sh["text"] | "");
    st.show.until = sh["until"] | 0u;
    st.show.updatedAt = sh["updatedAt"] | 0u;
    // From the app the GIF is {url, sha}; in the on-device cache it's just the sha.
    const char* sha = sh["gif"].is<JsonObjectConst>() ? (sh["gif"]["sha"] | "") : (sh["gifSha"] | "");
    st.show.hasGif = *sha != '\0';
    strlcpy(st.show.gifSha, sha, sizeof(st.show.gifSha));
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
  if (st.show.active || st.show.updatedAt) {
    JsonObject s = doc["show"].to<JsonObject>();
    s["active"] = st.show.active;
    s["text"] = st.show.text;
    s["until"] = st.show.until;
    s["updatedAt"] = st.show.updatedAt;
    if (st.show.hasGif) s["gifSha"] = st.show.gifSha;
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

const char* gifSlotName(size_t slot) {
  return slot == kShowSlot ? "show" : statusName(static_cast<Status>(slot));
}

bool parseGifs(const char* json, size_t len, GifRef out[kGifSlots]) {
  JsonDocument filter;
  filter["gifs"] = true;  // skip the schedule: only the GIFs matter here
  filter["show"]["active"] = true;
  filter["show"]["gif"] = true;
  JsonDocument doc;
  if (deserializeJson(doc, json, len, DeserializationOption::Filter(filter))) return false;
  JsonObjectConst gifs = doc["gifs"];
  if (gifs.isNull()) return false;
  for (size_t i = 0; i < kGifSlots; ++i) {
    GifRef g;
    // The show slot follows "show now": no show (or a cleared one) frees the file.
    JsonObjectConst o;
    if (i != kShowSlot) {
      o = gifs[gifSlotName(i)].as<JsonObjectConst>();
    } else if (doc["show"]["active"] | false) {
      o = doc["show"]["gif"].as<JsonObjectConst>();
    }
    const char* url = o["url"] | "";
    const char* sha = o["sha"] | "";
    // A URL too long for the buffer would be cut short and fail anyway; treat it as no GIF.
    if (!o.isNull() && *url && *sha && strlen(url) < sizeof(g.url)) {
      g.present = true;
      strlcpy(g.url, url, sizeof(g.url));
      strlcpy(g.sha, sha, sizeof(g.sha));
    }
    out[i] = g;
  }
  return true;
}

}  // namespace bzzy
