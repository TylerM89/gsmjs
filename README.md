# GSM.js
A Javascript library for the SIMCom SIM900/SIM808 GSM/GPRS Chipset based on the sim900js library: https://github.com/sensamo/sim900js

### Differences between SIM900js and GSMjs
* HTTP GET/POST use same function
* Commands return array of lines from the raw response
* Commands that have response data now properly include the data
* Improved response handling
* Constructor has default values now
* HTTP response isn't treated as an error now. The response is broken out into separate array items for easier access.
* HTTPS support
* Retry initial AT connect 3 times
* On connect, load device information - useful for debugging and verifying everything is working
* No longer errors out if HTTP service is already initialized.
* Added command for getting signal strength.

GSM.js does not have SMS functionality. I didn't need it for my project and didn't get a chance to test it.

### Usage
```
var gsm = new GSM();
gsm.connect(function(err) {
    if(err) return console.log('Error connecting to GSM', err);
    console.log('GSM connected');
    gsm.status(function(err, resp, raw){
       console.log('Status...' + raw[1] + ',' + raw[2]); 
       gsm.initialize(function(err, resp, raw){           
            // Do things here
       });
    });
});
```

### HTTP GET
```
gsm.request('https://httpbin.org/ip', function(response) {
    console.log('-> ' + response);
});
```

### HTTP POST
```
gsm.request('https://httpbin.org/post',
  {
      method: 1,
      data: JSON.stringify(data),
      contentType: 'application/json'
  }, function(response) {
      console.log('-> ' + response);
});
```
