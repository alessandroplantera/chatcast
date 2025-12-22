// src/bot/sessionManager.js - Manages bot recording sessions per-user

const { generateSessionId } = require('../helpers/telegram');
const CONFIG = require('../config/constants');

/**
 * Session Manager for Telegram bot
 * Manages recording state per user using ctx.session
 *
 * This replaces the global state variables and allows
 * multiple users to record simultaneously without conflicts
 */

class BotSessionManager {
  /**
   * Initialize a new session for the user
   */
  static initializeSession(ctx) {
    if (!ctx.session) {
      ctx.session = {};
    }

    ctx.session.recordingHasStarted = false;
    ctx.session.isPaused = false;
    ctx.session.sessionId = null;
    ctx.session.author = null;
    ctx.session.awaitingSessionTitle = false;
  }

  /**
   * Ensure session exists, create if not
   */
  static ensureSession(ctx) {
    if (!ctx.session || typeof ctx.session !== 'object') {
      this.initializeSession(ctx);
    }
  }

  /**
   * Start waiting for a session title
   */
  static startRecording(ctx) {
    this.ensureSession(ctx);

    ctx.session.recordingHasStarted = false;
    ctx.session.isPaused = false;
    ctx.session.awaitingSessionTitle = true;
    ctx.session.sessionId = generateSessionId();
    ctx.session.author = ctx.from.first_name || ctx.from.username || 'Anonymous';
  }

  /**
   * Finalize session start after title is provided
   */
  static finalizeStart(ctx) {
    this.ensureSession(ctx);

    ctx.session.awaitingSessionTitle = false;
    ctx.session.recordingHasStarted = true;
    ctx.session.isPaused = false;
  }

  /**
   * Pause the current recording
   */
  static pauseRecording(ctx) {
    this.ensureSession(ctx);

    if (ctx.session.recordingHasStarted && !ctx.session.isPaused) {
      ctx.session.isPaused = true;
      return true;
    }
    return false;
  }

  /**
   * Resume a paused recording
   */
  static resumeRecording(ctx) {
    this.ensureSession(ctx);

    if (ctx.session.recordingHasStarted && ctx.session.isPaused) {
      ctx.session.isPaused = false;
      return true;
    }
    return false;
  }

  /**
   * Stop the current recording
   */
  static stopRecording(ctx) {
    this.ensureSession(ctx);

    const wasRecording = ctx.session.recordingHasStarted;
    const sessionId = ctx.session.sessionId;

    this.initializeSession(ctx);

    return { wasRecording, sessionId };
  }

  /**
   * Check if currently recording
   */
  static isRecording(ctx) {
    this.ensureSession(ctx);
    return ctx.session.recordingHasStarted && !ctx.session.isPaused;
  }

  /**
   * Check if recording is paused
   */
  static isPaused(ctx) {
    this.ensureSession(ctx);
    return ctx.session.recordingHasStarted && ctx.session.isPaused;
  }

  /**
   * Check if awaiting session title
   */
  static isAwaitingTitle(ctx) {
    this.ensureSession(ctx);
    return ctx.session.awaitingSessionTitle && ctx.session.sessionId;
  }

  /**
   * Get current session ID
   */
  static getSessionId(ctx) {
    this.ensureSession(ctx);
    return ctx.session.sessionId;
  }

  /**
   * Get session author
   */
  static getAuthor(ctx) {
    this.ensureSession(ctx);
    return ctx.session.author;
  }

  /**
   * Get full session state (for debugging)
   */
  static getState(ctx) {
    this.ensureSession(ctx);
    return {
      recordingHasStarted: ctx.session.recordingHasStarted,
      isPaused: ctx.session.isPaused,
      sessionId: ctx.session.sessionId,
      author: ctx.session.author,
      awaitingSessionTitle: ctx.session.awaitingSessionTitle
    };
  }
}

module.exports = BotSessionManager;
