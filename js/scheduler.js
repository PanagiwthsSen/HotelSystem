/* ==============================================================
   SR-01: Heartbeat & Redundant Scheduler
   Αυτόνομος μηχανισμός ελέγχου που επιβλέπει ανά τακτά
   διαστήματα τη λειτουργία του κεντρικού Scheduler. Σε
   περίπτωση παγώματος ενεργοποιεί εφεδρικό worker και
   αποστέλλει κρίσιμη ειδοποίηση.
   ============================================================== */

;(function() {
  'use strict';

  const HEARTBEAT_INTERVAL = 10000;
  const STALL_MULTIPLIER = 2;
  const MAX_STALLED_CHECKS = 3;

  const tasks = new Map();
  let heartbeatId = null;
  let schedulerLoopId = null;
  let stalledCount = 0;
  let isRedundantActive = false;
  let lastSchedulerBeat = Date.now();

  function getSupabase() {
    return window.supabase;
  }

  async function sendCriticalAlert(taskName, errorMsg) {
    try {
      const supabase = getSupabase();
      if (!supabase) return;
      await supabase.from('NOTIFICATION').insert({
        TargetRole: 'admin',
        Type: 'critical',
        Message: `[Scheduler] Κρίσιμο σφάλμα: Η εργασία "${taskName}" απέτυχε. ${errorMsg}`,
        IsRead: false
      });
    } catch (_) {}
  }

  async function sendSchedulerFailAlert() {
    try {
      const supabase = getSupabase();
      if (!supabase) return;
      await supabase.from('NOTIFICATION').insert({
        TargetRole: 'admin',
        Type: 'critical',
        Message: `[Scheduler] Ο κεντρικός Scheduler δεν ανταποκρίνεται. Ενεργοποιήθηκε εφεδρικό σύστημα.`,
        IsRead: false
      });
    } catch (_) {}
  }

  async function runTask(name, taskDef) {
    try {
      await taskDef.fn();
      taskDef.lastRun = Date.now();
      taskDef.status = 'ok';
      taskDef.consecutiveFails = 0;
    } catch (err) {
      taskDef.consecutiveFails = (taskDef.consecutiveFails || 0) + 1;
      taskDef.status = 'error';
      const msg = err.message || 'άγνωστο σφάλμα';
      console.error(`[Scheduler] Εργασία "${name}" απέτυχε:`, msg);

      if (taskDef.consecutiveFails >= 2) {
        if (taskDef.fallbackFn) {
          try {
            await taskDef.fallbackFn();
            taskDef.status = 'fallback';
          } catch (fallErr) {
            taskDef.status = 'failed';
            await sendCriticalAlert(name, `${msg} (και το fallback απέτυχε: ${fallErr.message})`);
          }
        } else {
          await sendCriticalAlert(name, msg);
        }
      }
    }
  }

  function schedulerLoop() {
    lastSchedulerBeat = Date.now();
    const now = Date.now();

    tasks.forEach((taskDef, name) => {
      if (taskDef.status === 'running') return;
      const elapsed = now - (taskDef.lastRun || 0);
      if (elapsed >= taskDef.interval) {
        taskDef.status = 'running';
        runTask(name, taskDef).finally(() => {
          if (taskDef.status === 'running') taskDef.status = 'ok';
        });
      }
    });
  }

  function heartbeatCheck() {
    const elapsed = Date.now() - lastSchedulerBeat;
    const maxDelay = HEARTBEAT_INTERVAL * STALL_MULTIPLIER;

    if (elapsed > maxDelay) {
      stalledCount++;
      console.warn(`[Scheduler] Heartbeat: πιθανό πάγωμα (${stalledCount}/${MAX_STALLED_CHECKS})`);

      if (stalledCount >= MAX_STALLED_CHECKS && !isRedundantActive) {
        isRedundantActive = true;
        console.error('[Scheduler] Ενεργοποίηση εφεδρικού συστήματος!');
        sendSchedulerFailAlert();

        startRedundantScheduler();
      }
    } else {
      if (stalledCount > 0) stalledCount = 0;
      if (isRedundantActive) {
        isRedundantActive = false;
        console.log('[Scheduler] Επανέρχεται ο κεντρικός scheduler.');
      }
    }
  }

  function startRedundantScheduler() {
    const redundantId = setInterval(() => {
      if (!isRedundantActive) {
        clearInterval(redundantId);
        return;
      }
      tasks.forEach((taskDef, name) => {
        if (taskDef.status === 'running') return;
        const elapsed = Date.now() - (taskDef.lastRun || 0);
        if (elapsed >= taskDef.interval) {
          taskDef.status = 'running';
          runTask(name, taskDef).finally(() => {
            if (taskDef.status === 'running') taskDef.status = 'ok';
          });
        }
      });
    }, HEARTBEAT_INTERVAL);
  }

  const api = {
    registerTask(name, fn, intervalMs, fallbackFn) {
      if (tasks.has(name)) {
        console.warn(`[Scheduler] Η εργασία "${name}" έχει ήδη καταχωρηθεί.`);
        return;
      }
      tasks.set(name, {
        fn,
        interval: intervalMs,
        fallbackFn: fallbackFn || null,
        lastRun: 0,
        status: 'idle',
        consecutiveFails: 0
      });
    },

    unregisterTask(name) {
      tasks.delete(name);
    },

    start() {
      if (schedulerLoopId) return;
      console.log('[Scheduler] Εκκίνηση...');
      schedulerLoopId = setInterval(schedulerLoop, HEARTBEAT_INTERVAL);
      heartbeatId = setInterval(heartbeatCheck, HEARTBEAT_INTERVAL);
      schedulerLoop();
    },

    stop() {
      if (schedulerLoopId) {
        clearInterval(schedulerLoopId);
        schedulerLoopId = null;
      }
      if (heartbeatId) {
        clearInterval(heartbeatId);
        heartbeatId = null;
      }
      isRedundantActive = false;
      stalledCount = 0;
      tasks.forEach(t => { t.status = 'idle'; });
    },

    getStatus() {
      const result = {};
      tasks.forEach((t, name) => {
        result[name] = {
          status: t.status,
          lastRun: t.lastRun ? new Date(t.lastRun).toISOString() : null,
          interval: t.interval,
          fails: t.consecutiveFails
        };
      });
      return {
        running: schedulerLoopId !== null,
        redundantActive: isRedundantActive,
        stalledCount,
        tasks: result
      };
    }
  };

  window.HotelScheduler = api;
})();
