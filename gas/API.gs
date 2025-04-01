
//https://docs.bitfinex.com/reference/rest-public-platform-status
//gas 限制 網址擷取呼叫次數	20,000 次 / 天	
 
const bfx_url = 'https://api.bitfinex.com'; // 公共API端點
const bfx_auth_url = 'https://api.bitfinex.com'; // 認證API端點
const bfx_url_v2 = 'https://api-pub.bitfinex.com'; // 公共API v2端點
const bfx_auth_url_v2 = 'https://api.bitfinex.com'; // 認證API v2端點  

function safeApiCall(url, options = {}) { 
  options.muteHttpExceptions = true; 
  try {
    var response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() !== 200) {
      Logger.log('API call failed with status: ' + response.getResponseCode());
      return null;
    }
    return JSON.parse(response.getContentText());
  } catch (e) {
    Logger.log('API call exception: ' + e);
    return null;
  }
}

// 將字節數組轉換為十六進制字符串
function bytesToHex(data) {
  return data.map(e => (e < 0 ? e + 256 : e).toString(16).padStart(2, '0')).join("");
}

// 增加API調用計數
function url_fetch_increased() { 
  settings.urlNO++
  cache.put('urlNO',settings.urlNO, 3600); 
}
 // 清空url次數 
function url_fetch_init() {  
  cache.put('urlNO', 0, 3600); 
}

// 發送GET請求
function CommandGet(cmdpath, query) {
  const path = '/v1' + cmdpath + (query ? '?' + query : '');
  url_fetch_increased();
  return safeApiCall(bfx_url + path, { method: 'GET' });
}

// 發送GET請求（v2）
function CommandGet_v2(cmdpath, query) {
  const path = '/v2' + cmdpath + (query ? '?' + query : '');
  url_fetch_increased();
  return safeApiCall(bfx_url_v2 + path, { method: 'GET' });
}

// 發送POST請求
function CommandPost(cmdpath, data) {
  const path = '/v1' + cmdpath;
  const rawBody = {
    ...data,
    request: path,
    nonce: Date.now().toString(),
    aff_code: 'L8BhFk9pr'
  };

  const payload = Utilities.base64Encode(JSON.stringify(rawBody));
  const signature = bytesToHex(Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_384, payload, settings.apisecret));

  const options = {
    method: 'POST',
    contentType: "application/json",
    headers: {
      'X-BFX-APIKEY': settings.apikey,
      'X-BFX-PAYLOAD': payload,
      'X-BFX-SIGNATURE': signature
    },
    payload: JSON.stringify(rawBody),
    muteHttpExceptions: true,
  };

  url_fetch_increased();
  return safeApiCall(bfx_auth_url + path, options);
}

// 發送POST請求（v2）
function CommandPost_v2(cmdpath, data) {
  const nonce = Date.now().toString();
  const path = '/v2' + cmdpath;
  const rawBody = JSON.stringify(data || {});
  const signature = bytesToHex(Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_384, "/api" + path + nonce + rawBody, settings.apisecret));

  const options = {
    method: 'POST',
    contentType: "application/json",
    headers: {
      'bfx-nonce': nonce,
      'bfx-apikey': settings.apikey,
      'bfx-signature': signature
    },
    payload: rawBody
  };

  url_fetch_increased();
  return safeApiCall(bfx_auth_url_v2 + path, options);
}

//####################### 
// 獲取餘額
function updateBalances() {
  return CommandPost('/balances');
} 

function GetBalances(coin, type){  
  var target = balances.find((v) => v.currency === coin && v.type === type)
  Logger.log(target); 
  return target;
}

// 獲取K線數據
function GetCandles(currency, type, period, limit, sort) {
  return CommandGet_v2('/candles/trade:' + type + ':f' + currency.toUpperCase() + ':' + period + '/hist', 'limit=' + limit + '&sort=' + sort);
}

// 取消所有資金報價
function CancelAllFundingOffer(currency) {
  return CommandPost_v2('/auth/w/funding/offer/cancel/all', { currency });
}

// 取消指定的資金報價
function CancelFundingOffer(offerID) {
  return CommandPost_v2('/auth/w/funding/offer/cancel', { id: offerID });
}

// 獲取所有當前的資金報價
function GeAllFundingOfferALL() {
  return CommandPost_v2('/auth/r/funding/offers/', {});
}

// 獲取資金交易記錄
function GetFundingTrades(sym) {
  return CommandPost_v2('/auth/r/funding/trades/f' + sym + '/hist', { limit: 10 });
}

// 獲取資金信息
function GetFundingInfo(sym) {
  return CommandPost_v2('/auth/r/info/funding/f' + sym);
}

// 獲取資金報價
function GetFundingOffers(sym) {
  return CommandPost_v2('/auth/r/funding/offers/f' + sym);
}

function GetFundingCredits(sym) { 
  return CommandPost_v2(`/auth/r/funding/credits/f${sym}`, null);
}

function GetFundingCreditsHistory(sym) { 
  return CommandPost_v2(`/auth/r/funding/credits/f${sym}/hist`, {"limit":"25"});
}
    

function GetSummary(){
  var summary = CommandPost_v2('/auth/r/summary')
  return summary;
}

function GetCoinInfo(coin){
  var target = coins.find((v) => v[0] === coin)
  Logger.log(target); 
  return target;
}
 
// 獲取資金訂單簿
function GetFundingBook(sym, side, num) {
  return CommandGet('/lendbook/' + sym, 'limit_' + side + '=' + num);
}

// 提交資金報價
function SubmitFundingOffers(currency, amount, rate, period) {
  const data = {
    currency,
    amount: amount.toString(),
    rate: floatFixed(rate * 365).toString(), // 將利率轉換為年化利率
    period,
    direction: 'lend' // 方向為借出
  };
  return CommandPost('/offer/new', data);
}

// 取消資金報價
function CancelFundingOffer(offer_id) {
  return CommandPost('/offer/cancel', { offer_id });
}



//###################################
//取得價格

function  getNowPrices(symbol)
{
  var options = {muteHttpExceptions: true}; 
  var URL =  'https://api-pub.bitfinex.com/v2/tickers?symbols='+symbol
  resPrices = JSON.parse(UrlFetchApp.fetch(URL,options).getContentText());
  var LAST_PRICE     = resPrices[0][1] 
  return  LAST_PRICE
}

function  getAllPrices()
{ 
  const urlB = "https://api-pub.bitfinex.com/v2/tickers?symbols=ALL";  
  const responseB = UrlFetchApp.fetch(urlB, { 'muteHttpExceptions': true });  
  const dataB = JSON.parse(responseB.getContentText("UTF-8")); 
  return dataB
}

function getPrices(IDS) { 
  const options = { muteHttpExceptions: true }; 
  const URL = `https://api-pub.bitfinex.com/v2/tickers?symbols=${IDS}`;
  const resPrices = JSON.parse(UrlFetchApp.fetch(URL, options).getContentText());

  const xx = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }); 
  const messages = resPrices.map(price => {
    const SYMBOL = price[0].substring(1).replace("USD", "");
    const LAST_PRICE = price[1];
    return `【${SYMBOL}】 現價:${LAST_PRICE}`;
  }); 
  return messages.length > 0 ? `${xx}  ${messages.join("\n")}\n` : ""; 
}

function  getPricesHist(ID,xtime)
{ 
  try{
    var options = {muteHttpExceptions: true}; 
  var URL =  'https://api-pub.bitfinex.com/v2/tickers/hist?symbols=t'+ID+'USD&limit=1&end='+ (xtime).toString()
  resPrices = JSON.parse(UrlFetchApp.fetch(URL,options).getContentText()); 
  //var dtime =Utilities.formatDate(new Date(xtime), 'Asia/Taipei', 'yyyy-MM-dd HH:mm')  
  
    var LAST_PRICE  = resPrices[0][1]   
    return LAST_PRICE 
  }catch(e){
    return ""
  } 
}  

//[rate, days, count, amount]
function fetchOrderBook(symbol) {
  var url = 'https://api-pub.bitfinex.com/v2/book/f' + symbol + '/P0?len=100';
  var options = {
    muteHttpExceptions: true
  }; 
  return safeApiCall(url, options);
}
 
//###################################
var FBitfinex=new  iFRR("Bitfinex"); 
function iFRR(market)
{
  this.market = market;   
  this.USD = 0; //APY
  this.USDT = 0; //APY
  this.BTC = 0; //APY
  this.ETH = 0; //APY   
  this.FRR =0; //USD FRR
  this.FRRT =0;//USDT FRR  
}

//為了結省urlfetch次數，一次更新全部資料
function updateFRRAll() {
  const urlB = "https://api-pub.bitfinex.com/v2/conf/pub:raw:website:stats";  
  const responseB = UrlFetchApp.fetch(urlB, { 'muteHttpExceptions': true });  
  const dataB = JSON.parse(responseB.getContentText("UTF-8")); 
  const ITEM = dataB[0]; 

  const fundingRates = {
    "USD": "funding_rate_avg USD",
    "USDT": "funding_rate_avg UST",
    "BTC": "funding_rate_avg BTC",
    "ETH": "funding_rate_avg ETH"
  };

  for (const [key, value] of Object.entries(ITEM)) {
    try {
      if (fundingRates["USD"] === key) {
        FBitfinex.USD = getNO2(Number(value) * 365);
        FBitfinex.FRR = Number(value);
      } else if (fundingRates["USDT"] === key) {
        FBitfinex.USDT = getNO2(Number(value) * 365);
        FBitfinex.FRRT = Number(value);
      } else if (fundingRates["BTC"] === key) {
        FBitfinex.BTC = getNO2(Number(value) * 365);
      } else if (fundingRates["ETH"] === key) {
        FBitfinex.ETH = getNO2(Number(value) * 365);
      }

      // 順便 檢查是否有其他幣種利息超高 SOL ?
      if (key.includes("funding_rate_avg") && !key.includes("TIME") && !key.includes("TEST")) {
        const Rate = getNO2(Number(value) * 365);
        if (Rate > 50) {
          const ID = key.replace("funding_rate_avg ", "");
          console.log("其它高利:"+ ID +'  '+ Rate);
        }
      }
    } catch (e) {
      console.error(`Error processing key ${key}:`, e);
    }
  }
} 
 
// 獲取資金統計
function GetFRR(currency){  
  res =  CommandGet_v2('/funding/stats/f' + currency.toUpperCase() + '/hist', 'limit=1');
  if(res == null){
    return 1;
  } 
  //var frr = res[0][3] * 365 * 100;
  var frr = floatFixed(res[0][3] * 365 * 100);
  frr = floatFixed(Math.floor(frr * 10000) / 10000); 
  Logger.log(currency+' FRR: ' + frr); 
  return frr;
} 

//###################################
//'a30:p2:p30'  取得2~30天
//'a10:p2:p10'  取得2~10天
//'a10:p11:p20' /取得11~20天

//一小時間利息 排序
function GetSortedCandles(currency, type, limit, rank){
  
  var res = GetCandles(currency, type, 'a30:p2:p30', limit, -1);

  res = res.sort(function(x, y){
      return y[3] - x[3];
  }); 
 
  var rate = floatFixed(res[rank-1][3]*100);
  rate = floatFixed(Math.floor(rate * 10000) / 10000);
  
  var rateH = floatFixed(res[0][3]*100);
  rateHigh = floatFixed(Math.floor(rateH * 10000) / 10000);

  Logger.log('Avg High rate ' + rate + ' %' + ' ('+ rank + '/' + limit  + ')');
  Logger.log('Highest rate ' + rateHigh + ' %' + ' ('+ rateH + ')');
  var result = [rate, rateH];
  return result;
}

// 轉出資金
function TransferFunds(currency, amount) {   
  if (amount > 0) {
    const transfer = {
      from: 'funding',  
      to: 'exchange',
      currency: currency,
      amount: String(amount)
    };

    try { 
      console.log(transfer); 
      CommandPost_v2('/auth/w/transfer', transfer);
    } catch (e) {
      //sendBFXTelgram(`${currency}定投轉移發生錯誤! ${String(e)}`); -->這需要等一段時間
    }
  }
}

 


//##############################################
//周一至周五，早上9:30 AM（美東时间）  **** 特別時間用特別設定
function isUSStockMarketOpen() { 
  var now = new Date(); 
   
  var newYorkTimeZone = 'America/New_York';
  var scriptTime = Utilities.formatDate(now, newYorkTimeZone, 'HH:mm'); 
  var currentHour = parseInt(scriptTime.split(':')[0], 10);
  var currentMinute = parseInt(scriptTime.split(':')[1], 10);
   
  // 美国股市开市时间：周一至周五，9:30 AM - 4:00 PM（美东时间）
  var isWeekday = now.getDay() >= 1 && now.getDay() <= 5;
  var isMarketOpen = isWeekday && (currentHour > 9 || (currentHour === 9 && currentMinute >= 30)) && currentHour < 16; 
  
  return isMarketOpen;
}


//###########  utils  ###########  
var ilock = null;
function lock(){
  ilock = LockService.getUserLock();
  Logger.log('runing...');
  ilock.waitLock(500); //等 
  if(ilock.hasLock() != true){
    Logger.log('***************** lock failed: ' + lock);
    return false;
  } 
  return true;
}

function unlock(){
  if(ilock){
    ilock.releaseLock();
    Logger.log('release lock');
  }
}

function  sendBFXTelgram(msgx)
{  
  try{  
    var url= "https://api.telegram.org/bot"+ settings.token +'/sendMessage?chat_id='+settings.chatID+'&parse_mode=Markdown&text='+encodeURI(msgx);
    UrlFetchApp.fetch(url);  
  }
  catch(e)
  {} 
}

// 小數點2位
function getNO2(num) {
  return isNaN(num) ? 0 : parseFloat(num.toFixed(1));
}
function getNO5(num) {
  return isNaN(num) ? 0 : parseFloat(num.toFixed(5));
}

function floatFixed(num){
  return (Number)((Number)(num).toFixed(12));
} 

function isEmptyArray(arr) {
  return Array.isArray(arr) && arr.length === 0;
}

//比較差值
Array.prototype.diff = function(a) {
  return this.filter(i => !a.includes(i));
}; 