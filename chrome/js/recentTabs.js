(function () {
  var NUM_RECENT_TABS = 50; // Max number of records per window to keep

  var storage = chrome.storage.local;
  var windows = chrome.windows;
  var REC_KEY_PREFIX = "recentTabs#";

  function addRecentTab(tabId, recentTabs, size) {
    var i = recentTabs.indexOf(tabId);

    if (i == -1) {
      if (recentTabs.length == size) {
        recentTabs.pop();
      }
    } else {
      recentTabs.splice(i, 1);
    }
    recentTabs.unshift(tabId);
  }

  function createRecentRecord(winId) {
    var newRec = {};
    newRec[REC_KEY_PREFIX + winId] = [];
    storage.set(newRec);
  }

  function removeRecentRecord(winId) {
    storage.remove(REC_KEY_PREFIX + winId);
  }

  function clearRecentRecords(winId) {
    storage.clear();
  }

  function listenToWindowCreate() {
    windows.onCreated.addListener(function (newWin) {
      windows.getAll({}, function (wins) {
        if (wins.length == 1) { // It's the only window, so that
                                // we'll assume this is the start
                                // of a browser session
          clearRecentRecords();
        }
        createRecentRecord(newWin.id);
      });
    });
  }

  function listenToWindowClose() {
    windows.onRemoved.addListener(function (winId) {
      removeRecentRecord(winId);
    });
  }

  function updateRecentRecord(winId, tabId) {
    var key = REC_KEY_PREFIX + winId;
    storage.get(key, function (item) {
      var record = item[key];
      if (!(record instanceof Array)) { // create record if not exist.
                                        // This only has effect when extension
                                        // is installed/reloaded
        item[key] = record = [];
      }
      addRecentTab(tabId, record, NUM_RECENT_TABS);
      storage.set(item);
    });
  }

  function listenToTabHighlight() {
    chrome.tabs.onHighlighted.addListener(function (highlightInfo) {
      var winId = highlightInfo.windowId;
      var tabId = highlightInfo.tabIds[0];
      updateRecentRecord(winId, tabId);
    });
  }

  function init() {
    listenToWindowCreate();
    listenToWindowClose();
    listenToTabHighlight();
  }

  init();
})();
