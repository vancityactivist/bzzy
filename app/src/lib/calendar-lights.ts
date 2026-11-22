type WithLights = { lightIds?: string[] | null };

// The calendars one light uses. A calendar with no light list goes to every light that
// follows its owner; a list names exactly the lights (own-status lights only get calendars
// that name them). Rows cached before light lists existed count as no list.
export function calendarsForLight<C extends WithLights>(
  cals: C[],
  light: { id: string; followsOwner: boolean },
): C[] {
  return cals.filter((c) => (c.lightIds ? c.lightIds.includes(light.id) : light.followsOwner));
}

// The calendars that make *you* busy (the Home page, your team, the API's /v1/status):
// those used by a light that follows you, or by no particular light. A calendar picked
// only for a light with its own status (a meeting room, say) leaves you alone.
export function personCalendars<C extends WithLights>(cals: C[], followerIds: string[]): C[] {
  return cals.filter((c) => !c.lightIds || c.lightIds.some((id) => followerIds.includes(id)));
}
