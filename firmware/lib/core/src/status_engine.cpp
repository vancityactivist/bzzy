#include "status_engine.h"

#include <string.h>

namespace bzzy {

namespace {
struct NameEntry {
  Status status;
  const char* name;
};
constexpr NameEntry kNames[] = {
    {Status::Free, "free"},       {Status::Busy, "busy"}, {Status::Dnd, "dnd"},
    {Status::Away, "away"},       {Status::Unknown, "unknown"},
};
}  // namespace

const char* statusName(Status s) {
  for (const auto& e : kNames) {
    if (e.status == s) return e.name;
  }
  return "unknown";
}

bool parseStatus(const char* name, Status& out) {
  if (!name) return false;
  for (const auto& e : kNames) {
    if (strcmp(e.name, name) == 0) {
      out = e.status;
      return true;
    }
  }
  return false;
}

static bool overrideLive(const Override& o, uint32_t now) {
  if (!o.active) return false;
  if (o.until == 0) return true;
  // Without a clock we can't tell whether a timed override has expired.
  // Keep showing it: the person set it on purpose, which beats guessing.
  if (now == 0) return true;
  return now < o.until;
}

Resolved resolve(const State& st, uint32_t now, const Settings& cfg) {
  if (overrideLive(st.manual, now)) {
    return {st.manual.status, Source::Manual, st.manual.text, st.manual.until};
  }

  const bool clockOk = now != 0;
  const bool fresh = st.lastSync != 0 && clockOk && now >= st.lastSync &&
                     (now - st.lastSync) <= cfg.staleAfterSec;
  if (!fresh) {
    return {cfg.fallback, Source::Fallback, "", 0};
  }

  uint32_t nextChange = 0;
  for (size_t i = 0; i < st.blockCount; ++i) {
    const Block& b = st.blocks[i];
    if (b.start <= now && now < b.end) {
      return {b.status, Source::Calendar, b.text, b.end};
    }
    if (b.start > now && (nextChange == 0 || b.start < nextChange)) {
      nextChange = b.start;
    }
  }
  return {st.defaultStatus, Source::Default, "", nextChange};
}

void mergeFromServer(State& cached, const State& fromServer, uint32_t now) {
  (void)now;
  const Override keep = cached.manual;
  cached = fromServer;
  // A button press the app hasn't seen yet wins over anything older from the
  // app, including a clear (inactive tombstone) so a cleared override stays
  // cleared. Ties go to the app, which is where reported presses end up.
  if (keep.local && keep.updatedAt > fromServer.manual.updatedAt) {
    cached.manual = keep;
  }
}

void cycleLocalOverride(State& st, uint32_t now) {
  Override& o = st.manual;
  const bool live = overrideLive(o, now);
  if (!live) {
    o = Override();
    o.active = true;
    o.status = Status::Free;
  } else if (o.status == Status::Free) {
    o.status = Status::Busy;
  } else if (o.status == Status::Busy) {
    o.status = Status::Dnd;
  } else {
    // Back to automatic. Keep a tombstone so a stale server override
    // from before this press doesn't immediately reappear.
    o.active = false;
  }
  o.text[0] = '\0';
  o.until = 0;
  o.updatedAt = now;
  o.local = true;
}

void clearLocalOverride(State& st, uint32_t now) {
  Override& o = st.manual;
  o.active = false;  // kept as a tombstone, see cycleLocalOverride
  o.text[0] = '\0';
  o.until = 0;
  o.updatedAt = now;
  o.local = true;
}

}  // namespace bzzy
