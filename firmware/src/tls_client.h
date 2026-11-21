#pragma once
// WiFiClientSecure, minus a bug that closes file descriptor 0 (bzzy's open GIF file).
//
// In Arduino-ESP32 2.0.x, WiFiClientSecure::stop() closes the socket and then
// stop_ssl_socket() memsets the whole SSL context, which sets the socket field to 0
// instead of -1. The next stop() (HTTPClient::end() stops the client, then its
// destructor stops it again) sees socket 0 >= 0 and calls close(0). The first time
// that closes stdin; after that, fd 0 is handed to the next file opened, usually the GIF
// on screen, and the next request closes it under the player: the animation freezes
// about 20 s into each sync interval.
#include <WiFiClientSecure.h>

class TlsClient : public WiFiClientSecure {
 public:
  void stop() override {
    WiFiClientSecure::stop();
    sslclient->socket = -1;
  }
  // The base destructor calls stop() again, on the base class.
  ~TlsClient() { sslclient->socket = -1; }
};
