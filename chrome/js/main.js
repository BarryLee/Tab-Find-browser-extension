$(function () {
  var devMode = 0;
  if (devMode) {
    $('#debugbox').show();
  }
  var KEYCODE_DOWN = 40;
  var KEYCODE_UP = 38;
  var KEYCODE_ENTER = 13;
  var KEYCODE_BACKSPACE = 8;

  var tabSearchIndex = { titles : {}, urls : {} };
  var currentSelection = -1;

  var $searchInputBox = $('#search');
  var $searchResultTabList = $('#resultTabList');
  var $allTabList = $('#allTabList');
  var $resultsTitle = $('#resultsTitle');
  // TODO use this to replace others
  var TAB_ITEM_SELECTOR = 'li.tab';
  var TAB_LIST_SELECTOR = 'ul.tabList';

  // Local storage key for recent tabs
  var REC_KEY_PREFIX = "recentTabs#";

  var MIN_QUERY_LEN = 2;
  var NUM_RECENT_SHOWN = 5;


  function debug(msg) {
    if (devMode) {
      var $debugBox = $('#debugbox');
      var curVal = $debugBox.val();
      $debugBox.val(curVal ? (msg + '\n' + curVal) : msg);
    }
  }

  function dumpCurrentTab() {
    chrome.tabs.query({active: true, windowId: chrome.windows.WINDOW_ID_CURRENT}, function (tab) {
      tab = tab[0];
      debug("current tab=" + tab.index);
      for (var prop in tab) {
        debug(prop + "=" + tab[prop]);
      }
    })
  }

  function dumpCurrentWindow() {
    chrome.windows.getCurrent({}, function (win) {
      for (var prop in win) {
        debug(prop + "=" + win[prop]);
      }
    });
  }

  function getRecentTabsRecord(callback) {
    chrome.windows.getCurrent({}, function (win) {
      var key = REC_KEY_PREFIX + win.id;
      //debug('key=' + key);
      chrome.storage.local.get(key, function (item) {
        //debug(item[key]);
        var curWinRecentTabs = item[key] || [];
        callback(win.id, curWinRecentTabs);
      });
    });
  }

  function TabFuture(tab) {
    this.status = tab.status;
    this.tabId = tab.id;
    this.url = tab.url;
    this.title = tab.title;
    this.favIconUrl = tab.favIconUrl;
    this.index = tab.index;
    this.highlighted = tab.highlighted;
    /*
    if (tab.status != 'complete') {
      var _this = this;
      chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
        if (_this.tabId == tabId) {
          _this.status = changeInfo.status || tab.status;
          _this.url = changeInfo.url || tab.url;
          _this.title = tab.title;
          _this.favIconUrl = changeInfo.favIconUrl || tab.favIconUrl;
          if (changeInfo.status == 'complete') {
            chrome.tabs.onUpdated.removeListener
          }
        }
      });
    }
    */
  }

  TabFuture.prototype.onReady = function (callback) {
  }

  function sysQueryTabs(opts, recentTabIds, callback) {
    chrome.tabs.query(opts, function (tabs) {
      //debug(tabs.length);
      var tabList = [];
      var recentTabIdRank = {};
      for (var i = 0; i < recentTabIds.length; i++) {
        // NOTE: reverse order so that 0 is last
        recentTabIdRank[recentTabIds[i]] = recentTabIds.length - i;
      }
      for (var i = 0; i < tabs.length; i++) {
        var tab = tabs[i];
        var tabItem = new TabFuture(tab);
        // Rank in Most Recent Used list
        tabItem.mruRank = recentTabIdRank[tab.id] || 0;
        tabList.push(tabItem);
      }
      callback(tabList);
    });
  }

  function updateSearchIndex(tabList) {
    for (var i = 0; i < tabList.length; i++) {
      var tab = tabList[i];
      var title = tab.title.toLowerCase();
      var url = tab.url.toLowerCase();
      if (! (title in tabSearchIndex.titles)) {
        tabSearchIndex.titles[title] = [];
      }
      tabSearchIndex.titles[title].push(tab);
      if (! (url in tabSearchIndex.urls)) {
        tabSearchIndex.urls[url] = [];
      }
      tabSearchIndex.urls[url].push(tab);
    }
  }

  function createAllTabList() {
    getRecentTabsRecord(function (currentWinId, recentTabIds) {
      sysQueryTabs({windowId: currentWinId}, recentTabIds, function (tabList) {
        updateSearchIndex(tabList);
        updateUITabList($allTabList, tabList);
        $('#allTitle').html($('#allTitle')
                            .html()
                            .replace('0', tabList.length));
        tabList.sort(function (ta, tb) {
          // mruRank is in reverse order
          return tb.mruRank - ta.mruRank;
        });
        resultTabList = tabList.slice(1,
                Math.min(1 + NUM_RECENT_SHOWN, recentTabIds.length));
        updateUITabList($searchResultTabList, resultTabList);
      });
    });
  }

  function formatTabTitle(title) {
    return title;
  }

  function updateUITabList(target, tabList) {
    var $tabObjs = [];
    var $target = $(target).empty();
    if (tabList.length == 0) {
      $('<li></li>').append('<span></span>')
        .children()
        .css({ display: 'block', margin: '0 auto', color: '#555' })
        .html('no content')
        .end()
        .appendTo($target)
        ;
      return;
    }
    var tabElemList = [];
    for (var i = 0; i < tabList.length; i++) {
      var tab = tabList[i];
      var tabTitle = tab.title || tab.url;
      var tabElem = '<li class="tab' 
                        + (tab.highlighted ? ' highlight' : '') + '" '
                        + 'tabIdx="' + tab.index + '">'
                    + '<img class="tabFavicon" '
                          + 'src="' + tab.favIconUrl + '"/>'
                    + '<span class="tabTitle" title="' + tabTitle + '">'
                      + formatTabTitle(tabTitle)
                    + '</span>'
                  + '</li>'
                  ;

      tabElemList.push(tabElem);
    }
    $target.get(0).innerHTML = tabElemList.join('');
  }

  function switchToTab(tabIdx) {
    var noop = function (tabs) {window.close()};
    chrome.tabs.highlight({ tabs: tabIdx }, noop);
  }

  function bindTabClickHandler(container) {
    $(container).on('click', TAB_ITEM_SELECTOR, function (e) {
      switchToTab(parseInt($(this).attr('tabIdx')));
      //var $this = $(this);
      //debug($this.attr('tabIdx') + " is clicked");
      //chrome.tabs.highlight({ tabs: parseInt($this.attr('tabIdx')) }, noop);
    });
  }

  function searchTabs(query) {
    //debug('query:' + query);
    var results = {};
    if (query.length >= MIN_QUERY_LEN) {
      var indexes = [tabSearchIndex.titles, tabSearchIndex.urls];
      for (var i = 0; i < indexes.length; i++) {
        for (var key in indexes[i]) {
          if (key.search(query) != -1) {
            for (var j = 0; j < indexes[i][key].length; j++) {
              var tab = indexes[i][key][j];
              //debug(tab.tabId);
              var tabId = tab.tabId;
              if (! (tabId in results)) {
                results[tabId] = tab;
              }
            }
          }
        }
      }
    }

    var resultsArr = [];
    for (var key in results) {
      resultsArr.push(results[key]);
    }
    results = resultsArr;

    //debug('got ' + results.length + ' results');
    $resultsTitle.html('results (' + results.length + ')');
    // Save the current finished query for camparing with later input values
    $searchInputBox.data("currentQuery", query);
    selectNone(); // unselect currently selected item
    updateUITabList($searchResultTabList, results);
  }

  function initSearchComp() {
    var timeout;
    $searchInputBox.on('keydown', function (e) {
      if (e.keyCode != KEYCODE_DOWN && e.keyCode != KEYCODE_UP
          && e.keyCode != KEYCODE_ENTER) {
        clearTimeout(timeout);
      }
    })
    .on('keyup', function (e) {
      // User isn't typing, just navigating with arrow keys
      if (e.keyCode == KEYCODE_DOWN || e.keyCode == KEYCODE_UP
          || e.keyCode == KEYCODE_ENTER) {
        return;
      }

      // This could happen when popup is triggered by shortcut keys. Because
      // the search input element gets focus as soon as the page loads, the
      // keyup event from the shortcut keys may sneak in if the user had
      // pushed the keys a little bit longer
      if (e.keyCode != KEYCODE_BACKSPACE && $searchInputBox.val().length == 0) {
        return;
      }

      var timeout = setTimeout(function () {
        var query = $searchInputBox.val().trim().toLowerCase();
        // Do nothing if the query hasn't changed since last finished search
        if (query == $searchInputBox.data("currentQuery")) {
          return;
        }

        //debug('search for ' + query);
        searchTabs(query);
      }, 300);
    })
    ;
    setCaretToPos($searchInputBox.get(0), 0);
  }

  function selectNone() {
    $('ul.tabList>li.tab.preselect').removeClass('preselect');
  }

  function findNextItemCrossLists($tabLists, $currentSelected, direction) {
    //debug('cross lists');
    var numTabLists = $tabLists.length;
    var i = -1; // current selected tab list index

    if ($currentSelected.length) {
      var $list = $currentSelected.parent(TAB_LIST_SELECTOR);
      $tabLists.each(function (idx, elem) {
        if (elem == $list.get(0)) {
          i = idx;
          return false; // break out from each
        }
      });
    }

    var childSelector;
    var $nextList;
    // Find the next non-empty list in direction
    do {
      if (direction > 0) {
        i++;
        if (i >= numTabLists) {
          //debug('at bottom');
          return $currentSelected;
        }
        childSelector = 'li.tab:first-child';
      } else {
        i--;
        if (i < 0) {
          //debug('at top');
          //setCaretToEnd($searchInputBox.get(0));
          return $currentSelected;
        }
        childSelector = 'li.tab:last-child';
      }
      $nextList = $tabLists.filter(":eq("+i+")");
      //debug($nextList.get(0));
    } while ($nextList.children(TAB_ITEM_SELECTOR).length == 0);

    return $nextList.children(childSelector);
  }

  function findNextItemOnLists($tabLists, $currentSelected, direction) {

    var $nextSelect;

    if ($currentSelected.length) {
      var navFunc = direction > 0 ? $currentSelected.next : $currentSelected.prev;
      //debug('deselect current');
      $nextSelect = navFunc.call($currentSelected, TAB_ITEM_SELECTOR);
    }

    if (!($nextSelect && $nextSelect.length)) {
      $nextSelect = findNextItemCrossLists($tabLists, $currentSelected, direction);
    }

    return $nextSelect;
  }

  function scrollPage($currentSelect, $prevSelect, direction) {
    var distance         = 45, // the distance from a selected item to border
        $win             = $(window),
        currentScrollTop = $win.scrollTop();

    if ($currentSelect == $prevSelect) { // at top or bottom; let the scroll bar
                                         // also go to top or bottom
      $win.scrollTop(currentScrollTop + (direction > 0 ? 1 : -1) * distance);
      return;
    }

    var curSelectOffsetTop  = $currentSelect.offset().top,
        prevSelectOffsetTop = $prevSelect.offset().top,
        // the distance to scroll the page to keep the select
        // items in steady position
        step                = curSelectOffsetTop - prevSelectOffsetTop;

    if (direction > 0 && // moving down
        curSelectOffsetTop + distance >
            currentScrollTop + $(window).height() // out of visible area 
       ) {
      // scroll down
      $(window).scrollTop(currentScrollTop + step);
    }
    else if (curSelectOffsetTop - distance < // moving up, out of visible area
                currentScrollTop) {
      // scroll up
      $(window).scrollTop(currentScrollTop + step);
    }
  }

  function moveSelect(direction) {
    //debug(direction);
    var $tabLists = $(TAB_LIST_SELECTOR);
    //debug('numTabLists='+numTabLists);
    
    var $currentSelected = $('ul.tabList>li.tab.preselect');
    $currentSelected.removeClass('preselect');

    var $nextSelect = findNextItemOnLists($tabLists, $currentSelected, direction);
    $nextSelect.addClass('preselect');
    // Move scroll bar to keep the selected item visible
    scrollPage($nextSelect, $currentSelected, direction);
    return false;
  }

  function switchToSelectedTab() {
    var $selectedTab = $('li.preselect');
    if ($selectedTab.length) {
      switchToTab(parseInt($selectedTab.attr('tabIdx')));
    } else {
      if ($searchResultTabList.children(TAB_ITEM_SELECTOR).length) {
    switchToTab(parseInt($searchResultTabList
            .children(TAB_ITEM_SELECTOR + ':first-child').attr('tabIdx')));
      }
    }
  }

  function bindKeyboardHandlers() {
    $(document).on('keydown', function (e) {
      //debug(e.keyCode);
      switch (e.keyCode) {
        case KEYCODE_DOWN:
          return moveSelect(1);
          break;
        case KEYCODE_UP:
          return moveSelect(-1);
          break;
        case KEYCODE_ENTER:
          return switchToSelectedTab();
          break;
      }
      return true;
    })
  }

  function init() {
    //dumpCurrentWindow();
    //dumpCurrentTab();

    // Create all tabs list and insert into popup.html  
    createAllTabList();
    
    // Bind click handlers
    bindTabClickHandler(TAB_LIST_SELECTOR);

    // Init search component
    initSearchComp();

    // Bind keyboard handlers
    bindKeyboardHandlers();
  }

  // Initialize extension
  init();
});
