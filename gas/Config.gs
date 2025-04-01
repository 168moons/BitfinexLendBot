// 取得當前試算表
var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
var basicConfigSheet = spreadsheet.getSheetByName("config");
var sheetConfig = spreadsheet.getSheetByName("Advance"); 
var sheetEarn = spreadsheet.getSheetByName("Earn"); 

var coins =[]   // 定義 USD,USDT
var balances;   //資產
var back_usd =false //是否還錢?
var back_ust =false 

var size_min =150    //bitfinex 最小數量
var lendDay_max =120 //bitfinex 最長天數
 
var cache = CacheService.getScriptCache(); 

var settings = {
	apikey: '',   //BXF API keys  
  apisecret: '',//BXF secret key 
  token:'',     //TG token
  chatID:'',    //TG chat 
  flagAlert: true,
  alert_Statistics: true,
  alert_Lendout: true,
  alert_USDback: true,
  alert_HighRate: true,
  alert_HighUSDT: true, 
  urlNO: 0
};


function initConfig() {
  // 初始化設定
  settings.apikey = basicConfigSheet.getRange("B4").getValue();  
  settings.apisecret = basicConfigSheet.getRange("B5").getValue(); 
  
  settings.flagAlert = basicConfigSheet.getRange("B23").getValue();  
  settings.token = basicConfigSheet.getRange("B24").getValue();   
  settings.chatID = basicConfigSheet.getRange("B25").getValue();  

  settings.alert_Statistics = basicConfigSheet.getRange("A29").getValue();  
  settings.alert_Lendout = basicConfigSheet.getRange("A30").getValue();  
  settings.alert_USDback = basicConfigSheet.getRange("A31").getValue();  
  settings.alert_HighRate = basicConfigSheet.getRange("A32").getValue(); 
  settings.alert_HighUSDT = basicConfigSheet.getRange("A33").getValue(); 
  
  // 初始化幣種設定 
  coins.push(initCoin('usd', 0));
  coins.push(initCoin('ust', 2));
  //console.log(coins);

  settings.urlNO = parseInt(cache.get('urlNO')) 
  if (isNaN(settings.urlNO)) {
    settings.urlNO = 0; // 如果是 NaN，則設置為 0
  }
}

function initCoin(symbol, shift) {
  // 創建新的 coin 物件，避免物件參考問題
  const newCoin = {
    symbol: symbol,
    flagRUN: sheetConfig.getRange(2, 2 + shift).getValue(), // 啟動
    mode:  sheetConfig.getRange(2, 3 + shift).getValue(),  //模式: AI 或 自定

    keepMoney: sheetConfig.getRange(3, 2 + shift).getValue(), //保留現金
    normal_day:sheetConfig.getRange(3, 3 + shift).getValue(), //正常期 最高天數

    frr_flag: sheetConfig.getRange(4, 2 + shift).getValue(), // FRR 啟動
    frr_USD: Number(sheetConfig.getRange(5, 2 + shift).getValue()), // FRR 美元
    frr_day: Number(sheetConfig.getRange(4, 3 + shift).getValue()), // FRR 天數
    //frr_split_NO: Number(sheetConfig.getRange(5, 3 + shift).getValue()), // FRR 分割數
    
    fix_flag: sheetConfig.getRange(6, 2 + shift).getValue(), // 固定模式啟動
    fix_mode: sheetConfig.getRange(7, 2 + shift).getValue(), // 固定模式
    fix_rate: Number(sheetConfig.getRange(8, 2 + shift).getValue()), // 固定利率
    fix_day: Number(sheetConfig.getRange(6, 3 + shift).getValue()), // 固定天數
    fix_USD: Number(sheetConfig.getRange(9, 2 + shift).getValue()), // 固定區最大金額
    fix_split_NO: Number(sheetConfig.getRange(9, 3 + shift).getValue()), // 固定區分割次數
    
    split_NO: Number(sheetConfig.getRange(11, 2 + shift).getValue()), // 分割設定
    split_USD: Number(sheetConfig.getRange(11, 3 + shift).getValue()), // 分割美元
    splitAdd: Number(sheetConfig.getRange(12, 2 + shift).getValue()), // 分割累加利率
    split_mode: sheetConfig.getRange(13, 2 + shift).getValue(), // 分割模式
     
    flagUSA: sheetConfig.getRange(14, 2 + shift).getValue(), // 美股時間啟動
    USAadd: Number(sheetConfig.getRange(14, 3 + shift).getValue()), // 美股時間加碼
    
    flagTransfer: sheetConfig.getRange(15, 2 + shift).getValue(), // 啟動定投
    transfereMoney: sheetConfig.getRange(15, 3 + shift).getValue(), // 保留定投

    set: [], // 設定集

    //-----  以下需要更新後才會有值
    frr: 0,
    opRate:0
  };

  // 解析固定區間
  const tmp = String(sheetConfig.getRange(7, 3 + shift).getValue()).split("/");
  newCoin.fix_rangeA = Number(tmp[1].trim()); // 取樣區間
  newCoin.fix_rangeB = Number(tmp[0].trim()); // 區間排名

  // 初始化設定集
  for (let j = 2 + shift; j <= 3 + shift; j++) {
    const ratio = Number(sheetConfig.getRange(17, j).getValue()); // 佔比
    const rangeA = Number(sheetConfig.getRange(18, j).getValue()); // 取樣區間
    const rangeB = Number(sheetConfig.getRange(19, j).getValue()); // 區間排名 
    const rateDN = Number(sheetConfig.getRange(20, j).getValue()); // 最低利率
    const rateDN_Day = Number(sheetConfig.getRange(21, j).getValue());
    const rateUP = Number(sheetConfig.getRange(22, j).getValue()); // 最高利率
    const rateUP_Day = Number(sheetConfig.getRange(23, j).getValue());    

    if (ratio !== "") {
      newCoin.set.push({
        ratio: ratio,    //佔比
        rangeA: rangeA,  //取樣區間	
        rangeB: rangeB,  //區間排名
        rateUP: rateUP,
        rateUP_Day: rateUP_Day, //利率上限_天數	
        rateDN: rateDN,
        rateDN_Day: rateDN_Day  //利率下限_天數	
      }); 
    }
  } 
  return newCoin;
}
  
//####################################

function testAPI(){
  basicConfigSheet.getRange("D3").setValue('Running...')
  initConfig()    
  result = JSON.stringify(updateBalances())
  if(result.includes('Invalid') ){ 
    basicConfigSheet.getRange("D3").setValue('API KEY 輸入錯誤，請再確認!\n\n'+ result)
  }
  else{
    basicConfigSheet.getRange("D3").setValue('驗證成功!!  你的資產如下：\n'+ result)
  } 
}
function testTG(){
  basicConfigSheet.getRange("D3").setValue('Running...')
  initConfig()    
  sendBFXTelgram('這是一個測試訊息!! ^ ^')
  basicConfigSheet.getRange("D3").setValue('已傳送一個測試訊息至您的TG，請自行確認是否有收到! ')
}

function testUSD()
{ 
  basicConfigSheet.getRange("D7").setValue('Running...')
  initConfig()  
  basicConfigSheet.getRange("D7").setValue(queryLendOUT("USD",true))
}
function testUSDT()
{
  basicConfigSheet.getRange("D7").setValue('Running...')
  initConfig()  
  basicConfigSheet.getRange("D7").setValue(queryLendOUT("UST",true))
}
  
function testPlaceUSD()
{
  basicConfigSheet.getRange("D7").setValue('Running...')
  initConfig()  
  getOptimizeRateInfo(coins[0])
}
function testPlaceUSDT()
{
  basicConfigSheet.getRange("D7").setValue('Running...')
  initConfig()  
  getOptimizeRateInfo(coins[1])
}
//最佳化?
function getOptimizeRateInfo(coin){ 
  basicConfigSheet.getRange("D7").setValue('Running...') 
  var bookData =fetchOrderBook(coin.symbol.toUpperCase())   //USD,UST  
  data  = getBitfinexBook(bookData);
  const borrowOrders = data.borrowOrders; //借款
  const lendOrders = data.lendOrders;     //放款

  // 計算統計信息
  const borrowStats = calculateStatistics(borrowOrders);
  //console.log('borrowStats',borrowStats)
  const lendStats = calculateStatistics(lendOrders);
  console.log('lendStats',lendStats)
  //統計資料
  const result =getBookStatistics(borrowOrders,lendOrders,borrowStats,lendStats)
 

  frr =  GetFRR(coin.symbol)
  var MSG = 'FRR: '+ frr +'\n'
  MSG += '最佳高利區間: '+ getHoldRate(coin.symbol, '30m', coin.fix_rangeA,coin.fix_rangeB, frr)+'\n'; 
  MSG += JSON.stringify(result, null, 2)
  console.log(MSG)
  basicConfigSheet.getRange("D7").setValue(MSG)
}
//####################################

function testCancleUSD(){ 
  sheetConfig.getRange("A33").setValue('Running...')
  initConfig()  
  log = CancelAllFundingOffer('usd');  
  sheetConfig.getRange("A33").setValue('USD 掛單取消結果:'+log)
}

function testCancleUSDT(){ 
  sheetConfig.getRange("A33").setValue('Running...')
  initConfig()  
  log = CancelAllFundingOffer('ust');  
  sheetConfig.getRange("A33").setValue('USDT 掛單取消結果:'+log)
}

function testLendUSD(){ 
  sheetConfig.getRange("A33").setValue('取消所有USD掛單，並重新再掛')
  initConfig()  
  Lending(coins[0]) //USD
}

function testLendUSDT(){ 
  sheetConfig.getRange("A33").setValue('取消所有USDT掛單，並重新再掛')
  initConfig()  
  Lending(coins[1]) //USDT
}

function testGetBalanceUSD(){ 
  sheetConfig.getRange("A33").setValue('已更新 USD 全部資金、尚未放款資金、放款中(等待)')
  initConfig()  
  balances = updateBalances();   
  updateBalancesSheet("usd", 25, 2); //●全部資金 ●尚未放款資金  
  const waitUSD = GetFundingOffers('usd');  
  sheetConfig.getRange(27, 2).setValue(Number(waitUSD).toFixed());

}
function testGetBalanceUSDT(){ 
  sheetConfig.getRange("A33").setValue('已更新 USDT 全部資金、尚未放款資金、放款中(等待)')
  initConfig()  
  balances = updateBalances();    
  updateBalancesSheet("ust", 25, 4);
  const waitUSD = GetFundingOffers('ust'); 
  sheetConfig.getRange(27, 4).setValue(Number(waitUSD).toFixed());  
}