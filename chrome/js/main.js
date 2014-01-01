$(function () {
  var tabSearchIndex = { titles : {}, urls : {} };

  function debug(msg) {
    var $debugBox = $('#debugbox');
    var curVal = $debugBox.val();
    $debugBox.val(curVal ? (msg + '\n' + curVal) : msg);
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
    if (tab.status != 'completed') {
    }
    this.tabId = tab.id;
    this.url = tab.url;
    this.title = tab.title;
    this.favIconUrl = tab.favIconUrl;
    this.index = tab.index;
    this.highlighted = tab.highlighted;
  }

  TabFuture.prototype.onReady = function (callback) {
  }

  function sysQueryTabs(opts, callback) {
    chrome.tabs.query(opts, function (tabs) {
      debug(tabs.length);
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

  function bindTabClickHandler(container) {
    var noop = function (tabs) {window.close()};
    $(container).on('click', 'li.tab', function (e) {
      var $this = $(this);
      debug($this.attr('tabIdx') + " is clicked");
      chrome.tabs.highlight({ tabs: parseInt($this.attr('tabIdx')) }, noop);
    });
  }

  function searchTabs(query) {
 //   query = '*' + query + '*';
 //   //query = '*chrome*';
 //   sysQueryTabs({ title: query }, function (tabs) {
 //     debug('title:' + query);
 //     debug('got ' + tabs.length + ' results');
 //     $searchResultsArea = $('#results');
 //     $searchResultsArea.children('span.resultsTitle').html('results');
 //     updateUITabList($searchResultsArea.children('ul.tabList'), tabs);
 //   });
    debug('query:' + query);
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

    debug('got ' + results.length + ' results');
    $searchResultsArea = $('#results');
    $searchResultsArea.children('span.resultsTitle').html('results');
    updateUITabList($searchResultsArea.children('ul.tabList'), results);
  }

  function initSearchComp() {
    var $searchInputBox = $('#search');
    var timeout;
    $searchInputBox.on('keydown', function (e) {
      clearTimeout(timeout);
    }).on('keyup', function (e) {
      var timeout = setTimeout(function () {
        $('#results>ul.tabList').empty();
        var query = $searchInputBox.val().trim().toLowerCase();
        debug('search for ' + query);
        if (query.length < 3) {
          return;
        }
        searchTabs(query);
      }, 300);
    });
  }

  function init() {
    dumpCurrentTab();
    // Create all tabs list and insert into popup.html  
    createAllTabList();
    
    // Bind click handlers
    bindTabClickHandler('ul.tabList');

    // Init search component
    initSearchComp();
  }

  // Initialize extension
  init();
});
