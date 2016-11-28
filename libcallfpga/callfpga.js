// remember to announce the lib path to the system by:
// > export LD_LIBRARY_PATH=`pwd`:${LD_LIBRARY_PATH}
// from the libcallfpga directory

var ref = require("ref");
var ffi = require("ffi");

var myobj = ref.types.void 

var ZynqSG = ffi.Library('libcallfpga', {
  "callfpga": [ 'int', [  ] ]
});

var res = ZynqSG.callfpga();
console.log("res: " + res);
