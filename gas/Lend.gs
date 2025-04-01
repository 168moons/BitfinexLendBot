
var mm = Utilities.formatDate(new Date(), "Asia/Taipei", "mm");
var hh = Utilities.formatDate(new Date(), 'Asia/Taipei', 'HH');
var reset = 3  //重新掛單時間

function RunTEST() { 
  initConfig()
  balances = updateBalances();   
  optimizeALL()
  initConfig();   //重新讀設定 
  lending_all(); 
}

function Run() {     
  lock();  

  //#### 每分鐘都跑
  if (!cache.get("mm")) {
      cache.put("mm", hh, 60); // 緩存1分鐘 避免同一分鐘重跑 
      PlaceOrder(); // 每分鐘查詢是否有閒置資金， 如有就重新下單
  } 

  //#### 每半個小時重新掛單 
  if(mm%30==reset){ 
    optimizeALL()   //計算與更新最佳的參數 

    initConfig();   //重新讀設定 
    lending_all();  // 33分 和 3 分重新掛全部的單  
  }
  else{ 
    if(back_usd){   
        Lending(coins[0]) //usd還錢時，重新放
    }
    if(back_ust){ 
        Lending(coins[1]) //ust還錢時，重新放
    }
  } 

  //#### 統計告警
  if (mm % 60 == 3) {   // 每小時跑一次  
    if (!cache.get("hh")) {
      cache.put("hh", hh, 3600);  
      
      statisticsHour();  // 每小時統計資料 
      if(settings.flagAlert) //告警查詢
      {
        if(settings.alert_HighRate)
        {
          checkFrrOrderbook();  // 檢查高利 
        } 
        if( settings.alert_HighUSDT)
        {
          getAllPrice(); // 檢查USDT偏差
        }
      }  
    }    
  } 

  //####  計算今天收益情況 9:29 快照  9:35 算差值
  if (hh == 9) { 
    if (mm == 29 || mm == 35) { 
      if (!cache.get("mm")) {
        cache.put("mm", mm, 60); // 緩存1分鐘
        countProfit();  
      }  
    } 
    // 9點45分轉移資金
    if (mm == 45) {
      url_fetch_init() //清空url計數
      if(coins[0].flagTransfer){
        TransferFunds('USD', coins[0].transfereMoney);
        Utilities.sleep(10000); // 暫停10秒
      }
      if(coins[1].flagTransfer){
        TransferFunds('UST', coins[1].transfereMoney); 
      } 
    } 
  } 
  unlock();      
}
 
//######################################################################################################### 
// 計算最佳的參數
//最新即時資金 book  https://www.bitfinex.com/funding-book/

function optimizeRate(coin,shift)
{   
   updateFrrOPrate(coin)  //確認 frr 和 高利有值

  //檢查是否為high 自動更新高利開始位置
  if(coin.fix_mode ==='High')
  {
    coin.fix_rate = coin.opRate
    sheetConfig.getRange(8, 2 + shift).setValue(coin.opRate)  
  }

  //取得目前book的放款參數
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
  //getBookStatistics(borrowOrders,lendOrders,borrowStats,lendStats)
 

  flagHold = false  //正常情況
  if(coin.opRate>coin.frr){
    flagHold = true //高利期
  }
   
  //======  高利期
  if(flagHold)  //從 FRR 往上掛單到 opRate
  {
    //利率下限	
    sheetConfig.getRange(20, 2 + shift).setValue(coin.frr)  
    //利率上限 opRate
    sheetConfig.getRange(22, 2 + shift).setValue(coin.opRate) 
    //利率下限_天數	
    sheetConfig.getRange(21, 2 + shift).setValue(coin.normal_day - coin.split_NO)
  }

  //====== 正常情況: 從averageRate利率往上，增加高利
  else{
    //尋找 加權平均利率
    const targetRateOrder = findMinimumPeriodForRate(lendOrders, lendStats.weightedAverageRate);
    //console.log(targetRateOrder) 

    //利率下限  
    sheetConfig.getRange(20, 2 + shift).setValue(targetRateOrder.rate)  
    //利率下限_天數	
    sheetConfig.getRange(21, 2 + shift).setValue(targetRateOrder.period)
    //利率上限 opRate
    sheetConfig.getRange(22, 2 + shift).setValue(coin.opRate)  
  }
  
  //利率上限_天數	--> 期望的最高天數
  sheetConfig.getRange(23, 2 + shift).setValue(coin.normal_day)  
   

  //AI 只設定第一組 目前先固定 3/24 
  sheetConfig.getRange(17, 2 + shift).setValue(100) //100%比例(%)	 
  //取樣區間	區間排名	  
  sheetConfig.getRange(18, 2 + shift).setValue(24)  
  sheetConfig.getRange(19, 2 + shift).setValue(3)
   
}


// 獲取Bitfinex掛單數據
function getBitfinexBook(data) { 
  try {  
    
    // 將數據分為借款和放款兩部分
    const borrowOrders = [];
    const lendOrders = [];
    
    // 遍歷數據並分類
    data.forEach(function(order) {
      const rate = order[0] *100;  //用 % 來表示比較易懂
      const period = order[1];
      const count = order[2];
      const amount = order[3];
      
      // 創建訂單對象
      const orderObj = {
        rate: rate,
        period: period,
        count: count,
        amount: Math.abs(amount), // 儲存絕對值方便計算
        rawAmount: amount // 保留原始金額正負值
      };
      
      // 根據金額正負值分類
      if (amount < 0) {
        borrowOrders.push(orderObj); // 借款（負金額）
      } else {
        lendOrders.push(orderObj);   // 放款（正金額）
      }
    });
    
    // 排序借款和放款訂單
    borrowOrders.sort(function(a, b) {
      return a.rate - b.rate; // 借款按利率升序排列（低的在前）
    });
    
    lendOrders.sort(function(a, b) {
      return b.rate - a.rate; // 放款按利率降序排列（高的在前）
    });
    
    return { borrowOrders: borrowOrders, lendOrders: lendOrders };
  } catch (e) {
    Logger.log("數據發生錯誤: " + e);
    return null;
  }
}

// 計算基本統計數據
function calculateStatistics(orders) {
  if (!orders || orders.length === 0) {
    return null;
  }
  
  // 準備計算所需的變量
  let totalRate = 0;
  let totalAmount = 0;
  let totalPeriod = 0;
  let rates = [];
  let periods = [];
  let weightedRateSum = 0;
  
  // 期限分佈對象
  const periodDistribution = {};
  
  // 遍歷所有訂單進行計算
  orders.forEach(function(order) {
    totalRate += order.rate;
    totalAmount += order.amount;
    totalPeriod += order.period;
    
    rates.push(order.rate);
    periods.push(order.period);
    
    // 計算加權利率（以金額為權重）
    weightedRateSum += order.rate * order.amount;
    
    // 更新期限分佈統計
    const periodKey = order.period.toString();
    if (periodDistribution[periodKey]) {
      periodDistribution[periodKey].count += 1;
      periodDistribution[periodKey].amount += order.amount;
    } else {
      periodDistribution[periodKey] = {
        period: order.period,
        count: 1,
        amount: order.amount
      };
    }
  });
  
  // 計算平均利率
  const averageRate = totalRate / orders.length;
  
  // 計算平均期限
  const averagePeriod = totalPeriod / orders.length;
  
  // 計算加權平均利率
  const weightedAverageRate = weightedRateSum / totalAmount;
  
  // 計算中位數利率
  rates.sort(function(a, b) { return a - b; });
  let medianRate;
  if (rates.length % 2 === 0) {
    medianRate = (rates[rates.length / 2 - 1] + rates[rates.length / 2]) / 2;
  } else {
    medianRate = rates[Math.floor(rates.length / 2)];
  }
  
  // 計算中位數期限
  periods.sort(function(a, b) { return a - b; });
  let medianPeriod;
  if (periods.length % 2 === 0) {
    medianPeriod = (periods[periods.length / 2 - 1] + periods[periods.length / 2]) / 2;
  } else {
    medianPeriod = periods[Math.floor(periods.length / 2)];
  }
  
  // 轉換期限分佈為數組以便於排序
  const periodDistributionArray = Object.values(periodDistribution);
  periodDistributionArray.sort(function(a, b) { return a.period - b.period; });
  
  return {
    count: orders.length,
    totalAmount: totalAmount,
    averageRate: averageRate,
    medianRate: medianRate,
    weightedAverageRate: weightedAverageRate,
    averagePeriod: averagePeriod,
    medianPeriod: medianPeriod,
    periodDistribution: periodDistributionArray
  };
}

// 查找特定利率的最低天數
function findMinimumPeriodForRate(orders, targetRate) {
  if (!orders || orders.length === 0) {
    return null;
  }
  
  // 根據利率與目標利率的差異進行排序
  orders.sort(function(a, b) {
    return Math.abs(a.rate - targetRate) - Math.abs(b.rate - targetRate);
  });
  
  // 返回最接近目標利率的訂單
  return orders[0];
}

// 計算最佳年化回報率
function calculateBestAnnualReturns(lendOrders) {
  if (!lendOrders || lendOrders.length === 0) {
    return [];
  }
  
  // 為每個放款訂單計算年化回報率 APY
  const ordersWithAnnualReturn = lendOrders.map(function(order) {
    const annualReturn = (order.rate * 365) / order.period;
    return Object.assign({}, order, { annualReturn: annualReturn });
  });
  
  // 按年化回報率排序
  ordersWithAnnualReturn.sort(function(a, b) {
    return b.annualReturn - a.annualReturn;
  });
  
  return ordersWithAnnualReturn;
}

function getBookStatistics(borrowOrders,lendOrders,borrowStats,lendStats  )
{
  // 計算最佳年化回報率
  const bestReturns = calculateBestAnnualReturns(lendOrders);

  // 1. 借款訂單數據
  const borrowData = [["利率", "年化利率", "天數", "數量", "金額"]];
  borrowOrders.slice(0, 20).forEach(function(order) { // 只顯示前20個
    borrowData.push([
      order.rate,
      order.rate * 365,
      order.period,
      order.count,
      order.rawAmount
    ]);
  });
  
  // 2. 放款訂單數據
  const lendData = [["利率", "年化利率", "天數", "數量", "金額", "年化回報率"]];
  bestReturns.slice(0, 20).forEach(function(order) { // 只顯示前20個
    lendData.push([
      order.rate,
      order.rate * 365,
      order.period,
      order.count,
      order.rawAmount,
      order.annualReturn
    ]);
  });
  
  // 3. 統計信息
  const statsData = [
    ["指標", "借款方", "放款方"], 
    ["總金額", borrowStats.totalAmount, lendStats.totalAmount],
    ["平均利率", borrowStats.averageRate, lendStats.averageRate],
    ["平均年化利率", borrowStats.averageRate * 365, lendStats.averageRate * 365],
    ["中位數利率", borrowStats.medianRate, lendStats.medianRate],
    ["中位數年化利率", borrowStats.medianRate * 365, lendStats.medianRate * 365],
    ["加權平均利率", borrowStats.weightedAverageRate, lendStats.weightedAverageRate],
    ["加權平均年化利率", borrowStats.weightedAverageRate * 365, lendStats.weightedAverageRate * 365],
    ["平均天數", borrowStats.averagePeriod, lendStats.averagePeriod],
    ["中位數天數", borrowStats.medianPeriod, lendStats.medianPeriod] 
  ];

  console.log(statsData)
  return statsData
}
 
//#########################################################################################################

function optimizeALL()
{ 
  if(coins[0].mode ==='AI'){
    optimizeRate(coins[0],0) //USD
  } 
  if(coins[1].mode ==='AI'){
    optimizeRate(coins[1],2) //USDT
  }
}

function updateFrrOPrate(coin)
{
  //取得frr 和 利用高利區   如果是0 則重查
  if(coin.frr==0)
  {
    coin.frr =  GetFRR(coin.symbol)  
  }
  if(coin.opRate==0)
  {
    coin.opRate = getHoldRate(coin.symbol, '30m', coin.fix_rangeA,coin.fix_rangeB, coin.frr)
  }
}

function PlaceOrder() { 
  initConfig() 
  balances = updateBalances();   
  getAvailable()  //確認是否有可用資金&還錢通知  
}
function lending_all(){
  coins.forEach(function(coin){  
    Lending(coin);
  });
}

function cancel_all_funding_offers(){
  coins.forEach(function(coin){
    CancelAllFundingOffer(coin.symbol);
  });
}

var pending=[] //掛單中 GLOBAL VAR
function Lending(coin) {   
  var frrKeep = 0;  
 if (!coin.flagRUN)  {
    Logger.log(`${coin.symbol} 目前模式為手動下單情況下!`);
    return;
  }
  else { 
    if ( !coin.frr_flag ) {
      Logger.log(`cancel ALL: ${coin.symbol}`);
      CancelAllFundingOffer(coin.symbol); //FRR 沒有啟動，先取消全部單子
      Utilities.sleep(5000); //取消單子後，需要等待  資金才會釋放
    }  
    else { 
      pending = GeAllFundingOfferALL(); 
      frrKeep = CancelExceptFRR(coin.symbol, coin.frr_USD); //FRR 掛單不要取消，先進先出，需要等待 
                                                            // frr_USD 要相同，不然會先取消單 重掛
      Utilities.sleep(5000); 
    }
  }
  //上述取消單後，要重新更新Balances
  balances = updateBalances();  

  var bal = GetBalances(coin.symbol, 'deposit');
  if (!bal) {
    Logger.log(`在融資錢包裡找不到 ${coin.symbol}`);
    return;
  }
   
  updateFrrOPrate(coin)
  //var frr = GetFRR(coin.symbol); //計算FRR
  var cur_total = bal.amount;
  var cur_available = bal.available - coin.keepMoney;
  var cur_used = floatFixed(cur_total - cur_available);  //已使用資金
  Logger.log(`${coin.symbol} 總數： ${cur_total}, 可用餘額： ${cur_available}`);
  
  if (cur_available <= size_min) {
    Logger.log(`小於150，目前可用金額: ${cur_available}`);
    return;
  }
  

  //######  第一部份 先放 FRR  (如果可用資金太少<frr_USD , 就先跳過不借)  
  if (coin.frr_flag  && frrKeep ===0 && (cur_available - coin.frr_USD) > 0  &&  coin.frr_USD>size_min ) {
      SubmitFundingOffers(coin.symbol, coin.frr_USD, '0', coin.frr_day);  //FRR 單的利率是 0 
      cur_available = floatFixed(cur_available - coin.frr_USD)
      cur_used = floatFixed(cur_used +  coin.frr_USD);  
      Logger.log(`---->  FRR 放貸數量為: ${coin.frr_USD}, 天數: ${coin.frr_day}`); 
    }
  

  //######  第二部份 固定區間  高利模式 / 指定開始rate  

  if (coin.fix_flag  && (cur_available - coin.fix_USD) > 0  &&  coin.fix_USD>size_min ){   
    var rates = GetSortedCandles(coin.symbol, '1h', coin.fix_rangeA, coin.fix_rangeB); //取得指定區間rate
    var rateAvg = rates[0]  //高利區 平均利
    var rateH = rates[1] //最高利 
    
    if(coin.fix_mode ==='High'){ //高利模式
        if(rateH >coin.frr){
          handleFixedRate(coin,frr,rateH)  //期望超過FRR (從FRR往上掛單)
        }else{
          handleFixedRate(coin,rateAvg,coin.frr)  //從高利區平均 掛到FRR  
        } 
    }
    else{
      handleFixedRate(coin,coin.fix_rate,rateH)  //從指定rate往上掛 ,  往上佈單時儘量別超過近最高點
    } 
  }

  //######  第三部份 正常區間
  if (cur_available>size_min ) {  
    for (const lend of coin.set) { 
      
      lend_size = floatFixed((lend.ratio *  cur_available)/100)  
      if(lend_size>0){
        console.log("========  Normal =========")  
        if(coin.split_mode=='Fixed')
        {
          orders_split_Normal(coin.symbol, lend_size, lend.rateDN,coin.split_USD,coin.splitAdd, lend.rateDN, lend.rateDN_Day,lend.rateUP,lend.rateUP_Day ) 
        }
        else{
          var lend_rates = GetSortedCandles(coin.symbol, '1h', lend.rangeA, lend.rangeB); //取得指定區間rate
          var lend_rateAvg = lend_rates[0]  //高利區 平均利
          var lend_rateH = lend_rates[1] //最高利     

          if(lend_rateAvg <lend.rateDN){
            Logger.log('期望借出利率 ' + lend_rateAvg + ' 太低，改以最低利率 ' + lend.rateDN + ' 放貸');
          }
           
          //AUTO 分割模式 
          splitAdd = (lend.rateUP-lend.rateDN)/coin.split_NO   //動態分割RATE 
         
          orders_split_Normal(coin.symbol, lend_size, lend_rateAvg,coin.split_USD,splitAdd, lend.rateDN, lend.rateDN_Day,lend.rateUP,lend.rateUP_Day ) 
        }
        
      } 
    }  
  } 
} 



//#######  FRR ####### 
//除了frr之外，取消掛單
function CancelExceptFRR(symbol,pendingSize)
{  
  frrKeep = 0  //代表目前有保留單在上面  
  for(var i=0;i<pending.length;i++)
  {
    id = pending[i][0]
    try{
      sym  = pending[i][1]  
      if(sym=='f'+ symbol.toUpperCase())  //fUSD
      {        
        unit  = pending[i][4] 
        rate  = pending[i][14] 
        //如果rate是0 代表FRR   其它的就取消掛單
        if(rate!=0 && id!=0) {
          //console.log(id,sym,unit,rate)           
          CancelFundingOffer(id)
          Logger.log('取消 '+sym+' ID:'+id +" U:"+unit +" R:"+rate) 
        } 
        else{
          frrSize = unit
          frrID = id    //如frr 數量不對，也是要砍掉
          if(frrSize != pendingSize){ 
              CancelFundingOffer(frrID)
              Logger.log('取消 「FRR」 ID:'+id +" SYM:"+symbol +" U:"+frrSize )  
          }
          else
          {
            Logger.log('保留 「FRR」 ID:'+id +" SYM:"+symbol +" U:"+frrSize )   
            frrKeep = 1
          }
        }
      } 
    }
    catch(e)
    {
      console.log(id +" invalid...") 
    } // ["error",10001,"id: invalid"] ???
    
  }
  return frrKeep  
} 


function CheckKeepFRR(symbol,pendingSize)
{  
  frrKeep = 0  //代表目前有保留單在上面  
  for(var i=0;i<pending.length;i++)
  {
    id = pending[i][0]
    try{
      sym  = pending[i][1]  
      if(sym=='f'+ symbol.toUpperCase())  //fUSD
      {        
        unit  = pending[i][4] 
        rate  = pending[i][14] 
        //如果rate是0 代表FRR   其它的就取消掛單
        if(rate==0 && pendingSize == unit) {
          frrKeep=1
        }  
      } 
    }catch(e){}  
  }
  return frrKeep  
} 


//#######  固定 #######
function handleFixedRate( coin , rate_Start, rate_End) {  
  if(rate_Start > rate_End){
    rate_Start = rate_End
    rate_End = rate_Start + coin.fix_split_NO * 0.001  //防呆
    Logger.log(`近期高點利率較低!! 改用近期「高點利率」做為初始固定利率 ${rate_End} `); 
  } 
  if (coin.flagUSA && isUSStockMarketOpen()) rate_Start += coin.addUSA; //美國時間

  Logger.log(`指定放貸 開始利率 ${rate_Start}，初始天數: ${coin.fix_day}`); 
  rate_split = (rate_End - rate_Start)/coin.fix_split_NO
  size_split = coin.fix_USD/coin.fix_split_NO
  if(size_split<size_min){
    size_split = size_min
  }
  orders_split_FIX(coin.symbol, coin.fix_day, coin.fix_USD , rate_Start, size_split , rate_split); 

}
function orders_split_FIX(symbol, period, size, rate, size_split, rate_split) {
  let i = 1;
  while (size > 0) {
    const orderSize = Math.min(size, size_split);
     // 如果剩餘的 size 小於 orderSize * 2，則使用剩餘的 size
    if (size < orderSize * 2) {
      Logger.log(`HighFixed split order ${i}, ${size}/${size}, rate ${rate}, period ${period}`);
      SubmitFundingOffers(symbol, size, rate, period); 
      size =0
    } else {
      Logger.log(`HighFixed split order ${i}, ${orderSize}/${size}, rate ${rate}, period ${period}`);
      SubmitFundingOffers(symbol, orderSize, rate, period);
      size = floatFixed(size - orderSize);
      rate = floatFixed(rate + rate_split);
      period = Math.min(period + 1, lendDay_max);
    }
    i++;
  }
}

//####### 正常 ####### 

//等比例進行切割
function get_period(rate, day_rate_min, day_min, day_rate_max, day_max){
  var period = 0;

  if(rate <= day_rate_min)
    period = day_min;

  else if(rate >= day_rate_max)
    period = day_max;

  else{ 
    //動態區間
    period = floatFixed((rate-day_rate_min)/(day_rate_max-day_rate_min) * (day_max-day_min) + day_min); 
  } 
  period = floatFixed(Math.round(period)); 
  return period;
}

function orders_split_Normal(symbol,  size, rate, size_split, rate_split, day_rate_min, day_min, day_rate_max, day_max) {
  let i = 1; 
  while (size > 0) {
    //rate 開始利率  AUTO 高利區、 Fixed 
    var new_period = get_period(rate, day_rate_min, day_min, day_rate_max, day_max);
    
    const orderSize = Math.min(size, size_split);
    // 如果剩餘的 size 小於 orderSize * 2，則使用剩餘的 size
    if (size < orderSize * 2) { 
      Logger.log(`Normal split order ${i}, ${size}/${size}, rate ${rate}, period ${new_period}`);
      SubmitFundingOffers(symbol, size, rate, new_period); 
      size =0
    } else { 
      Logger.log(`Normal split order ${i}, ${orderSize}/${size}, rate ${rate}, period ${new_period}`);
      SubmitFundingOffers(symbol, orderSize, rate, new_period);
      size = floatFixed(size - orderSize);
      rate = floatFixed(rate + rate_split);
    }
    i++;
  }
}
 

