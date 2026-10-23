/* Active MV3 owners only. */
importScripts(
 'actions/refresh/refresh-controller.js',
 'actions/scroll/scroll-event-recorder.js',
 'core/capture/auto-download.js',
 'core/capture/hook-recovery.js',
 'actions/detail/dom-native-store.js',
 'actions/greet/greet-queue.js',
 'core/shared/action-event-router.js'
);
BossRawDownloads.install();
BossNaturalDetail.install();
BossGreetQueue.install();
BossActionRouter.install();
