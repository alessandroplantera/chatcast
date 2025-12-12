// Minimal Socket.IO client helper
(function (global) {
  const SocketClient = {
    socket: null,
    connect() {
      if (this.socket) return this.socket;
      if (typeof io === 'undefined') {
        console.warn('Socket.IO client not found (io). Is /socket.io/socket.io.js loaded?');
        return null;
      }
      this.socket = io();
      this.socket.on('connect', () => {
        console.log('[SocketClient] connect', this.socket.id);
      });
      this.socket.on('connect_error', (err) => {
        console.error('[SocketClient] connect_error', err);
      });
      this.socket.on('disconnect', (reason) => {
        console.log('[SocketClient] disconnect', reason);
      });
      this.socket.on('reconnect_attempt', () => {
        console.log('[SocketClient] reconnect_attempt');
      });
      return this.socket;
    },
    joinSession(sessionId) {
      if (!this.socket) this.connect();
      if (!this.socket) return;
      const room = `session:${sessionId}`;
      console.log(`[SocketClient] joinSession -> joining room ${room}`);
      this.socket.emit('join', room);
    },
    // Join an arbitrary room name (useful for global 'sessions' room)
    joinRoom(room) {
      if (!this.socket) this.connect();
      if (!this.socket) return;
      console.log(`[SocketClient] joinRoom -> joining room ${room}`);
      this.socket.emit('join', room);
    },
    leaveSession(sessionId) {
      if (!this.socket) return;
      const room = `session:${sessionId}`;
      console.log(`[SocketClient] leaveSession -> leaving room ${room}`);
      this.socket.emit('leave', room);
    },
    on(event, cb) {
      if (!this.socket) this.connect();
      if (!this.socket) return;
      console.log(`[SocketClient] on -> registering listener for ${event}`);
      this.socket.on(event, cb);
    }
    ,
    off(event, cb) {
      if (!this.socket) return;
      console.log(`[SocketClient] off -> removing listener for ${event}`);
      this.socket.off(event, cb);
    }
  };

  global.SocketClient = SocketClient;
})(window);
