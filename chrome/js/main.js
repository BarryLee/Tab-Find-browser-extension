$(function () {
  var devMode = 0;
  if (devMode) {
    $('#debugbox').show();
  }
  var KEYCODE_DOWN = 40;
  var KEYCODE_UP = 38;
  var KEYCODE_ENTER = 13;

  var tabSearchIndex = { titles : {}, urls : {} };
  var currentSelection = -1;

  var $searchInputBox = $('#search');
  // TODO use this to replace others
  var $searchResultTabList = $('#resultTabList');
  // TODO use this to replace others
  var TAB_ITEM_SELECTOR = 'li.tab';
  var TAB_LIST_SELECTOR = 'ul.tabList';

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
      debug("current tab=" + tab);
      for (var prop in tab) {
        debug(prop + "=" + tab[prop]);
      }
    })
  }

  function TabFuture(tab) {
    this.status = tab.status;
    this.tabId = tab.id;
    this.url = tab.url;
    this.title = tab.title;
    this.favIconUrl = tab.favIconUrl;
    this.index = tab.index;
    this.highlighted = tab.highlighted;
    if (tab.status != 'complete') {
      var _this = this;
      /*
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
      */
    }
  }

  TabFuture.prototype.onReady = function (callback) {
  }

  function sysQueryTabs(opts, callback) {
    chrome.tabs.query(opts, function (tabs) {
      //debug(tabs.length);
      var tabList = [];
      for (var i = 0; i < tabs.length; i++) {
        var tab = tabs[i];
        tabList.push(new TabFuture(tab));
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
    sysQueryTabs({windowId: chrome.windows.WINDOW_ID_CURRENT}, function (tabList) {
      updateSearchIndex(tabList);
      updateUITabList($('#alltabs>ul.tabList'), tabList);
    });
  }

  function formatTabTitle(title) {
    return title;
  }

  function updateUITabList(target, tabList) {
    var $tabObjs = [];
    //debug(target.get(0) + "");
    var $target = $(target).empty();
    for (var i = 0; i < tabList.length; i++) {
      var tab = tabList[i];
      var $tab = $('<li class="tab"></li>')
              .append('<img class="tabFavicon"/>')
              .children('.tabFavicon')
                .attr('src', tab.favIconUrl)
              .end()
              .append('<span class="tabTitle"></span>')
              .children('.tabTitle')
                .html(formatTabTitle(tab.title||tab.url))
                .attr('title', tab.title||tab.url)
              .end()
              .attr('tabId', tab.tabId)
              .attr('tabIdx', tab.index)
              ;
      if (tab.highlighted) {
        $tab.addClass('highlight');
      }
      //debug($tab.attr('tabIdx'));
      $target.append($tab);
    }
  }

  function switchToTab(tabIdx) {
    var noop = function (tabs) {window.close()};
    chrome.tabs.highlight({ tabs: tabIdx }, noop);
  }

  function bindTabClickHandler(container) {
    $(container).on('click', 'li.tab', function (e) {
      switchToTab(parseInt($(this).attr('tabIdx')));
      //var $this = $(this);
      //debug($this.attr('tabIdx') + " is clicked");
      //chrome.tabs.highlight({ tabs: parseInt($this.attr('tabIdx')) }, noop);
    });
  }

  function searchTabs(query) {
    //debug('query:' + query);
    var results = {};
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

    var resultsArr = [];
    for (var key in results) {
      resultsArr.push(results[key]);
    }
    results = resultsArr;

    //debug('got ' + results.length + ' results');
    $searchResultsArea = $('#results');
    $searchResultsArea.children('span.resultsTitle').html('results');
    // Save the current finished query for camparing with later input values
    $searchInputBox.data("currentQuery", query);
    if (results.length) {
      updateUITabList($searchResultsArea.children(TAB_LIST_SELECTOR), results);
    }
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
      if (e.keyCode == KEYCODE_DOWN || e.keyCode == KEYCODE_UP
	      || e.keyCode == KEYCODE_ENTER) {
	return;
      }
      var timeout = setTimeout(function () {
        var query = $searchInputBox.val().trim().toLowerCase();
	// Do nothing if the query hasn't changed since last finished search
	if (query == $searchInputBox.data("currentQuery")) {
          return;
	}
        $('#results>ul.tabList').empty();
        //debug('search for ' + query);
        if (query.length < 3) {
          // Have to update this otherwise later searches won't start
          $searchInputBox.data("currentQuery", query);
          return;
        }
        searchTabs(query);
      }, 300);
    })
    //.focus() // TODO make sure it works
    ;
    setCaretToPos($searchInputBox.get(0), 0);
  }

  function moveSelect(direction) {
    //debug(direction);
    var $tabLists = $(TAB_LIST_SELECTOR);
    var numTabLists = $tabLists.length;
    debug('numTabLists='+numTabLists);
    
    var $currentSelected = $('ul.tabList>li.tab.preselect');
    var i = -1; // current selected tab list index

    if ($currentSelected.length) {
      var navFunc = direction > 0 ? $currentSelected.next : $currentSelected.prev;
      debug('deselect current');
      $currentSelected.removeClass('preselect');
      $newSelect = navFunc.call($currentSelected, 'li.tab');
      if ($newSelect.length) {
        $newSelect.addClass('preselect');
        //return true;
        return false;
      } else {
        debug('cross lists');
        var $list = $currentSelected.parent(TAB_LIST_SELECTOR);
        $tabLists.each(function (idx, elem) {
          debug('elem='+elem);
          debug('idx='+idx);
          if (elem == $list.get(0)) {
            i = idx;
            debug('i='+i);
            return false; // break out from each
          }
        });
      }
    }

    var childSelector;
    var $nextList;
    do {
      if (direction > 0) {
        i++;
        if (i >= numTabLists) {
          debug('at bottom');
          $currentSelected.addClass('preselect');
          //return true;
          return false;
        }
        childSelector = 'li.tab:first-child';
      } else {
        i--;
        if (i < 0) {
          debug('at top');
          $currentSelected.addClass('preselect');
          //setCaretToEnd($searchInputBox.get(0));
          return false;
        }
        childSelector = 'li.tab:last-child';
      }
      $nextList = $tabLists.filter(':eq('+i+')');
    } while ($nextList.children().length == 0);

    $nextList
      .children(childSelector).addClass('preselect');
    return false;
  }

  function switchToSelectedTab() {
    var $selectedTab = $('li.preselect');
    if ($selectedTab.length) {
      switchToTab(parseInt($selectedTab.attr('tabIdx')));
    } else {
      if ($searchResultTabList.children(TAB_ITEM_SELECTOR).length == 1) {
	switchToTab(parseInt($searchResultTabList
			.children(TAB_ITEM_SELECTOR).attr('tabIdx')));
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
    dumpCurrentTab();
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
