// Capacitive touch (CST816T) on the touch version of the board. We only use its
// built-in gesture detection, so there's no coordinate maths to calibrate.
// No-ops (always returns None) on boards without touch.
#pragma once

namespace touch {

enum class Gesture { None, Tap, DoubleTap, LongPress, SwipeUp, SwipeDown, SwipeLeft, SwipeRight };

void begin();
Gesture poll();  // call every loop; returns each gesture once

}  // namespace touch
