

function test() {  
  
  initConfig()
  balances = updateBalances();   
  //getAvailable()  //確認是否有可用資金&還錢通知  
  statisticsHour()
  
} 


// 每小時統計
function statisticsHour() {  
  var result_usd  = gatherBalanceInfo(coins[0]) 
  var result_ust  = gatherBalanceInfo(coins[1]);
  console.log(result_usd) 
  console.log(result_ust) 

  if(settings.flagAlert){
    if(settings.alert_Statistics)
    {
      sendBFXTelgram(result_usd.log +'\n---\n'+result_ust.log);  
    } 
    if(settings.alert_Lendout)
    {
      queryLendOUT("USD",false);
      queryLendOUT("UST",false); 
    } 
  } 
   
  //儲存掛單情況
  // 如果沒有還錢情況下，需要更新cache getBackOrder 
  //if(!settings.alert_USDback){
  if(true){   
    cache.put('USD', JSON.stringify(GetFundingCredits('USD')), 2*3600);  
    cache.put('UST', JSON.stringify(GetFundingCredits('USDT')), 2*3600); 
  }
}


function calculateCheckAmount(coin) {
  const frr_flag = coin.frr_flag === true;
  const frr_USD = Number(coin.frr_USD); 
  const keepMoney = Number(coin.keepMoney);  
  const split_USD = Number(coin.split_USD)  
  return split_USD + (frr_flag ? frr_USD : 0) + keepMoney;
}

// 計算可以掛單金額
function getAvailable() {
  const balances = {
    USD: GetBalances("usd", 'deposit'),
    USDT: GetBalances("ust", 'deposit')
  };
 

  [coins[0], coins[1]].forEach((coin, index) => {
    const currency = index === 0 ? 'USD' : 'USDT'; 
    const balance =  balances[currency];
    const checkAmount = calculateCheckAmount(coin);
    
    
    if (balance && balance.available > checkAmount) { 
      if (settings.flagAlert && settings.alert_USDback) {
        const availableBalance = parseFloat(balance.available).toFixed(1)
        const message = `🍟${currency}可用金額: ${availableBalance}\n`; 
        console.log(message)
        sendBFXTelgram(message);
        getBackOrder(currency,coin.frr); // 還錢檢查通知
        if(currency==='USD'){
          back_usd =true 
        }
        if(currency==='USDT'){  
          back_ust =true 
        }
      }
    }
  });  
}

var qbackCount =0 //計算還沒有到期，但提前還款

// 還款資產異動通知
function getBackOrder(TYPE, frr) {
  const currency = TYPE === "USDT" ? "UST" : "USD";
  const fundingTrades = GetFundingCredits(currency);
  const TradesIDS = fundingTrades.map(trade => trade[0]);

  let fundingTrades_OLD = [];
  try {
    const cached = cache.get(currency);
    if (cached) fundingTrades_OLD = JSON.parse(cached);
  } catch (e) {
    Logger.log("Error parsing cached data:", e);
  }

  const DiffIDS = TradesIDS.diff(fundingTrades_OLD.map(trade => trade[0]));
  const timestamp = Date.now();

  let MSG = "";
  DiffIDS.forEach(diffID => {
    const newTrade = fundingTrades.find(trade => trade[0] === diffID);
    if (!newTrade) return;

    const logEntry = createLogEntry(newTrade, timestamp, frr);
    MSG += logEntry;

    if (++qbackCount % 5 === 0) {
      sendBFXTelgram(`👌 ${currency}還錢!\n${MSG}`);
      MSG = "";
    }
  });

  if (MSG) {
    const xx = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    sendBFXTelgram(`👌 ${currency}還錢! ${xx}\n${MSG}`);
  }

  if (qbackCount > 5) {
    const alertMessage = currency === "USD" ? "🚨🚨🚨 USD 大量提前還錢! 可能趁拉高出貨(短期高點)!" : "🚨🚨🚨 USDT 大量提前還錢! 可能為爆倉!";
    sendBFXTelgram(alertMessage);
  }

  if (DiffIDS.length > 0) {
    try {
      cache.put(currency, JSON.stringify(fundingTrades), 2 * 3600);
    } catch (e) {
      Logger.log("Error caching data:", e);
    }
  }
}

function createLogEntry(trade, timestamp, frr) {
  const [xtime, amount, period, pair, symbol] = [
    trade[13],
    parseInt(trade[5]).toFixed(),
    trade[12],
    trade[21].replace("t", "").replace("USD", ""),
    trade[21]
  ];

  const difftime = ((timestamp - xtime) / (60 * 60 * 24 * 1000)).toFixed(2);
  const d = Utilities.formatDate(new Date(xtime), 'Asia/Taipei', 'MM/dd HH:mm');
  let rate = parseFloat(trade[11] * 100).toFixed(4) || `⚡FRR${parseFloat(frr).toFixed(4)}`;
  let rateAPY = parseFloat(trade[11] * 100 * 365).toFixed(2) || parseFloat(frr * 365).toFixed(2);

  let logx = `●${d} ${period}天 金額:${amount} 利率:${rate}(${rateAPY}%) 對:${pair} -持(${getKeepDate(period, difftime)})天\n`;

  try {
    const getHisPrice = parseFloat(getPricesHist(pair, xtime));
    const nowPrice = getNowPrices(symbol);
    const diffP = ((nowPrice - getHisPrice) * 100 / getHisPrice).toFixed(1);
    logx += `進場價:${getHisPrice.toFixed(1)} 目前價:${nowPrice.toFixed(1)} 差${gReturn(nowPrice, getHisPrice)} (${diffP}%)\n`;
  } catch (e) {
    Logger.log(e);
  }

  return logx;
}




//############################
// 檢查FRR訂單簿
function checkFrrOrderbook() {
  var currencies = ['USD', 'UST'];
  var MSG = "";

  updateFRRAll()  //找全部Order  -->FBitfinex.FRR 

  currencies.forEach(function(id) {
    //var URL = 'https://api-pub.bitfinex.com/v2/book/f' + id + '/P0?len=100'; 
    //var resPrices = JSON.parse(UrlFetchApp.fetch(URL, { muteHttpExceptions: true }).getContentText());
    var resPrices =fetchOrderBook(id)

    var rate = resPrices[0][0] * 100; // 利率
    var MoneyBorrow = resPrices.reduce((sum, price) => sum + (price[3] < 0 ? -price[3] : 0), 0);
    var MoneyLend = resPrices.reduce((sum, price) => sum + (price[0] * 100 < FBitfinex.FRR && price[3] > 0 ? price[3] : 0), 0);
    var MoneyLendALL = resPrices.reduce((sum, price) => sum + (price[3] > 0 ? price[3] : 0), 0);

    var mbs = MoneyBorrow / MoneyLend;
    if (mbs < 1) {
      MSG += `【${id}】借款/放款比為: ${getNO2(mbs)} 借: ${getNO2(MoneyBorrow / 1000000)}M 放(frr之下): ${getNO2(MoneyLend / 1000000)}M 放: ${getNO2X(MoneyLendALL / 1000000, 50)}M \n`;
    }

    if (rate >= FBitfinex.FRR && FBitfinex.FRR !== 0) { 
      var rateDay = resPrices[0][1];
      var rateMoney = getNO5(-1 * resPrices[0][3] / 1000); // 資金需求 
      MSG += `【${id}】利率: ${getNO5(rate)} (${getNO2(rate * 365)}%) 超過FRR 天數: ${rateDay} 資金需求: ${getNO2(rateMoney)}M\n\n`;
    }
  });

  if (MSG) {
    if(settings.flagAlert && settings.alert_HighRate)
    {
      sendBFXTelgram("🌞 高利:" + MSG);
    } 
  } 
}



// 收集資金資訊
function gatherBalanceInfo(coin) {
  const bal = GetBalances(coin.symbol, 'deposit');  
  const { amount: cur_total, available: cur_available } = bal; 
  const cur_used = floatFixed(cur_total - cur_available); 
  let log = '';

 
  const frr = GetFRR(coin.symbol);
  //判斷是否有進入高利模式 
  const opRate = getHoldRate(coin.symbol, '30m', coin.fix_rangeA,coin.fix_rangeB, frr); 
  console.log(opRate,coin.symbol ,coin.fix_rangeA,coin.fix_rangeB)

  log += opRate > frr ? '🌞高! ' : '';
  log += `${coin.symbol.toUpperCase()}：${parseInt(cur_total).toFixed()} 餘：${parseInt(cur_available).toFixed()} `;

  const waitUSD = GetFundingOffers(coin.symbol === "usd" ? 'USD' : 'UST').reduce((sum, offer) => sum + offer[4], 0);
  log += `等：【${parseInt(waitUSD).toFixed()}】\n`;  

  const rowIndex = coin.symbol === "usd" ? 2 : 4;
  sheetConfig.getRange(25, rowIndex).setValue(Number(cur_total).toFixed());
  sheetConfig.getRange(26, rowIndex).setValue(Number(cur_available).toFixed());
  sheetConfig.getRange(27, rowIndex).setValue(Number(waitUSD).toFixed());

  log += `FRR：${parseFloat(frr).toFixed(4)} (${parseFloat(frr * 365).toFixed(1)}%)\n`; 
  const avgRate = parseFloat(GetFundingInfo(coin.symbol === "usd" ? "USD" : "UST")[2][1] * 100).toFixed(6);
  log += `放出均利率:${parseFloat(avgRate).toFixed(4)}【${parseFloat(avgRate * 365).toFixed(1)}%】\n`;

   // 包裝成一個物件
  var result = {
    log: log,
    frr: frr,
    opRate: opRate
  };
  return result
}

// 查詢最近放貨狀況
function queryLendOUT(currency,flagDebug) { 
  //const fundingOffers = CommandPost_v2(`/auth/r/funding/offers/f${currency}/hist`, null);     //資金掛單
  const fundingOffers =GetFundingOffers(currency)
  const now = new Date().getTime();
  //const fundingTrades = CommandPost_v2(`/auth/r/funding/credits/f${currency}`, null); 
  const fundingTrades =GetFundingCredits(currency)

  let log = "";
  const pairs = []; 
  const frr = parseFloat(GetFRR(currency)).toFixed(4)

  fundingOffers.forEach(offer => {
    const xtime = offer[3]; 
    var action = offer[10]; 
    // -->只有看 EXECUTED 部份

    //只顯示一個小時內資訊
    if(flagDebug || ((action.indexOf('EXECUTED')>=0) && (now - xtime) / (60 * 60 * 1000) < 1)){ 
      const dTime = Utilities.formatDate(new Date(xtime), 'Asia/Taipei', 'M/d HH:mm'); 
      const amount = parseInt(offer[5]).toFixed();  
      let rate = parseFloat(offer[14] * 100).toFixed(4);
      const rateAPY = parseFloat(offer[14] * 100 * 365).toFixed(2);    
      const period = offer[15]; 

      if (rate == 0) {
        rate = `⚡FRR ${frr}`;  
      }  

      const pair = fundingTrades.find(trade => trade[0] == offer[0])?.[21].replace("t", "").replace(currency, "") || "尚未開倉";
      log += `${dTime} ${period}天 金額:${amount} 利率:${rate} (${rateAPY}%) 對:${pair}\n`;
      if (pair !== "尚未開倉") pairs.push(pair);
    }
  }); 

  if (log )
  { 
    const uniquePairs = [...new Set(pairs)];
    if(isEmptyArray(uniquePairs))
    { 
      sendBFXTelgram("⚾\n✅借出(" + currency + "):\n" + log);
    }
    else{
      const IDS = uniquePairs.map(item => "t" + item + "USD").join(","); 
      console.log(IDS)
      sendBFXTelgram("⚾" + getPrices(IDS) + "\n✅借出(" + currency + "):\n" + log);
    } 
  }
  return log 
}


// 高利模式 取得平均FRR做為固定利率基礎
function getHoldRate(currency, type, limit, rank, frr) {  
  const res = GetCandles(currency, type, 'a30:p2:p30', limit, -1);   
  const lastRate = floatFixed(res[0][3] * 100);  
 
  if (lastRate > frr && settings.flagAlert && settings.alert_HighRate) {
    sendBFXTelgram(`🔥 【${currency}】高利通知!\n 半小時內曾出現高利:${lastRate} > FRR:${frr}\n 從現在開始進入高利模式放貸，維持24個小時!`);
  }

  res.sort((x, y) => y[3] - x[3]);   
  const rateHighest = floatFixed(res[0][3] * 100); 
  const rateSecond = floatFixed(res[1][3]*100);  //第二高
  
  const avg_rate = floatFixed(res.slice(0, rank).reduce((sum, item) => sum + floatFixed(item[3] * 100), 0) / rank);

  if (rateHighest > frr) {
    Logger.log('進入高利hold模式 : 平均' + avg_rate);    
    return Math.max(frr, avg_rate);
  }
  else{
    //return rateHighest
    return avg_rate //高利區平均
  }  
}

//###################################
// 計算收益
function countProfit() {
  var hhmm = Utilities.formatDate(new Date(), "GMT+8", "HHmm");

  if (hhmm == 0929) {
    updateBalancesSheet("usd", 25, 2); //●全部資金 ●尚未放款資金
    updateBalancesSheet("ust", 25, 4);
  }

  if (hhmm == 0935) {
      
    var usdU = parseFloat(sheetConfig.getRange(25, 2).getValue()) ;
    var usdT = parseFloat(sheetConfig.getRange(25, 4).getValue());
    var bal = GetBalances("usd", 'deposit');
    var balt = GetBalances("ust", 'deposit');
  
    var usdU_Diff = Number(bal.amount) -usdU ;
    var usdT_Diff = Number(balt.amount) -usdT;
    sheetConfig.getRange(28, 2).setValue(usdU_Diff)
    sheetConfig.getRange(28, 4).setValue(usdT_Diff)
    
    sendBFXTelgram("🙏🙏🙏 今天收益:" + getNO2(usdU_Diff + usdT_Diff) + queryLendMoneyAll());
    addEarnSheet(bal.amount, usdU_Diff, balt.amount, usdT_Diff); //加入圖表
  
  }
}

function updateBalancesSheet(currency, row, col) {
  var bal = GetBalances(currency, 'deposit');
  if (bal != null) {
    sheetConfig.getRange(row, col).setValue(Number(bal.amount).toFixed(1));
    sheetConfig.getRange(row + 1, col).setValue(Number(bal.available).toFixed(1));
  }
}
  

function getMonthProfit() { 
  var summary = GetSummary();
  var gusd = summary[6][1]['USD'];
  var gust = summary[6][1]['UST'];
  var monthGet = summary[6][2];

  var MSG = "⏰💰💰💰 " + " 30天總收益:【" + monthGet.toFixed(1) + "】\nUSD: " + gusd.toFixed(1) + "\nUSDT: " + gust.toFixed(1);
  console.log(MSG);
  sendBFXTelgram(MSG);
}

function queryLendMoneyAll() {
  return "\n---\n即將到期金額\n【USD】" + queryLendMoney('USD') + "\n【USDT】" + queryLendMoney('UST');
}

function queryLendMoney(currency) {
  //var fundingTrades = CommandPost_v2('/auth/r/funding/credits/f' + currency, null);
  var fundingTrades = GetFundingCredits(currency)
  
  const timestamp = Date.now();
  var money1 = 0, money7 = 0, money30 = 0;

  fundingTrades.forEach(trade => {
    var xtime = trade[13]; // 到期時間
    var active = trade[7];
    var amount = trade[5]; // 金額
    var days = trade[12]; // 借出時間 
    var difftime = ((timestamp - xtime) / (60 * 60 * 24 * 1000)).toFixed(2);
    var diff = days - difftime; // 剩下天數

    if (diff < 1) money1 += amount;
    if (diff < 7) money7 += amount;
    if (diff < 30) money30 += amount;
  });

  return "天:" + parseFloat(money1).toFixed(1) + "  周:" + parseFloat(money7).toFixed(1) + "  月: " + parseFloat(money30).toFixed(1);
}
 

function addEarnSheet(USD, USDearn, USDT, USDTearn) {
  try {
    var d = new Date();
    var LastRow = sheetEarn.getLastRow();
    sheetEarn.getRange(LastRow + 1, 1, 1, 5).setValues([[d, USD, USDearn, USDT, USDTearn]]);
  } catch (e) {
    Logger.log(e);
  }
}

 


//###################################
var lookUST =0.5 //USDT 差異，通知 
// 取得所有coin 的最新報價  當usdt 到某一定可以套利值時，進行通知
function getAllPrice() {
  //const urlB = "https://api-pub.bitfinex.com/v2/tickers?symbols=ALL";  
  //const responseB = UrlFetchApp.fetch(urlB, { 'muteHttpExceptions': true });  
  //const dataB = JSON.parse(responseB.getContentText("UTF-8")); 
  const dataB = getAllPrices()
  const minUST = 1 - (0.01 * lookUST);
  const maxUST = 1 + (0.01 * lookUST); 

  dataB.forEach(item => {
    const ID = item[0];
    if (ID === 'tUSTUSD') {
      const price = item[7];
      const vol = item[8];
      console.log(ID, price, vol);

      let Msg = "";
      if (price < minUST) {
        Msg = `💸💸💸USDT 目前現價為 【${price}】\n▼價格低於偏差值${lookUST}% (${minUST})\n建議: 將美金轉成USDT`;
      } else if (price > maxUST) {
        Msg = `💸💸💸USDT 目前現價為 【${price}】\n▲價格高於偏差值${lookUST}% (${maxUST})\n建議: 將美金轉成USDT`;
      }

      if (Msg) {
        console.log(Msg);
        sendBFXTelgram(Msg);
      }
    } 
  });
}




function gReturn(nowPrice,getHisPrice)
{
  profit = nowPrice - getHisPrice
  if(profit >0) {
    return profit.toFixed(1)+"😀"
  }
  else{
    return profit.toFixed(1)+"😨"
  } 
} 

function getKeepDate(inDate,outDate)
{
  if(outDate>=inDate)
  {
    return outDate
  }
  else{
    qbackCount =qbackCount+1  //提前還錢才會去累加
    return outDate+"💢"
  } 
}
