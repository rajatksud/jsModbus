
var assert = require("assert");
var Put = require('put');

describe("ModbusClient setup", function () {

  var modbusClient;

  beforeEach(function (done) {

    var dummy = function () { };

    modbusClient = require('../src/jsModbusClient');
    // shut down the logger
    modbusClient.setLogger(dummy);    
    require('../src/jsModbusHandler').setLogger(dummy);

    done();

  });

  afterEach(function (done) {

    var name = require.resolve('..');
    delete require.cache[name]; 
    done();

  });

  it("should initiate", function (done) {

    var netMock = {
      connect: function(port, host, cb) {

        assert.equal(port, 502);
        assert.equal(host, '127.0.0.1');
        done();

        return { on: function () { } };

      }
    };

    var client = modbusClient.create(502, '127.0.0.1', netMock);

    assert.ok(client);
  });

  /**
   *  The actual requests are tested here
   */

  describe('Making requests', function () {

    var client, onData;

    beforeEach(function (done) {
      var onConnect;
      var eMock = { on: function (evnt, cb) {
        if (evnt === 'connect') { onConnect = cb; }
        if (evnt === 'data') { onData = cb; }
      }};

      var netMock = { 
        connect: function () {
          return eMock;
        }
      };

      client = modbusClient.create(502, '127.0.0.1', netMock);
      done();
    });

    /**
     *  Simply read input registers with success
     */

    it("should read input register just fine", function (done) {

      var cb = function (resp) {
        assert.deepEqual(resp, { fc: 4, byteCount: 2, register: [ 42 ]});

        done();
      };

      client.readInputRegister(0, 1, cb);

      var res = Put()
                .word16be(0)   // transaction id
		.word16be(0)   // protocol id
		.word16be(5)   // length 
		.word8(1)      // unit id
		.word8(4)      // function code
		.word8(2)      // byte count
		.word16be(42)  // register 0 value
		.buffer();

      onData(res);

    });

    it('should handle responses coming in different order just fine', function (done) {

      var cb1 = function (resp, err) {

        // first request

        assert.ok(resp);
	assert.deepEqual(resp, { fc: 4, byteCount: 2, register: [ 42 ]});

        done();
      },
      cb2 = function (resp, err) {

        assert.ok(resp);
	assert.deepEqual(resp, { fc: 4, byteCount: 2, register: [43] });	

        // second request
        
      };

      client.readInputRegister(0, 1, cb1);
      client.readInputRegister(1, 1, cb2);

      var res1 = Put().word16be(0).word16be(0).word16be(5).word8(1) // header
	          .word8(4)  	// function code
 		  .word8(2)  	// byte count
  		  .word16be(42) // register 0 value = 42
		  .buffer();

      var res2 = Put().word16be(1).word16be(0).word16be(5).word8(1) // header
		  .word8(4)     // function code
                  .word8(2)     // byte count
                  .word16be(43) // register 1 value = 43
                  .buffer();

      onData(res2); // second request finish first
      onData(res1); // first request finish last

    });

    /**
     *  Handle an error response 
     */

    it("should handle an error while reading input register", function (done) {

      var cb = function (resp, err) {
	assert.equal(resp, null);
        assert.ok(err);
        assert.deepEqual(err, { 
		errorCode: 0x84, 
		exceptionCode: 1, 
		message: 'ILLEGAL FUNCTION' });
        done();
      };

      client.readInputRegister(0, 1, cb);

      var res = Put().word16be(0).word16be(0).word16be(3).word8(1) // header
		 .word8(0x84)  // error code
	         .word8(1)     // exception code
		 .buffer();

      onData(res);

    });

    it('should handle a read coil request', function (done) {

      var cb = function (resp, err) {
        assert.ok(resp);
        assert.deepEqual(resp, {
		fc: 1, 
		byteCount: 3, 
		coils: [true, false, true, false, true, false, true, false, 
			true, false, true, false, true, false, true, false,
			true, false, false, false, false, false, false, false]
		});
        done();
      };

      client.readCoils(0, 17, cb);

      var res = Put().word16be(0).word16be(0).word16be(6).word8(1) // header
		.word8(1)  // function code
		.word8(3)  // byte count
		.word8(85) // bits 0 - 7  = 01010101 = 85
		.word8(85) // bits 7 - 15 = 01010101 = 85
		.word8(1)  // bit 16      = 00000001 = 1
		.buffer();

      onData(res);

    });

    it('should handle a write single coil request with value false', function (done) {

      var cb = function (resp, err) {
        assert.ok(resp);
	assert.deepEqual(resp, {
	  fc: 5,
	  byteCount: 4,
	  outputAddress: 13,
	  outputValue: false
        });

	done();
      }

      client.writeSingleCoil(13, false, cb);

      var res = Put().word16be(0).word16be(0).word16be(7).word8(1) // header
		.word8(5)     // function code
		.word8(4)     // byte count
		.word16be(13) // output address
	        .word16be(0)  // off
		.buffer();

       onData(res);

    });

    it('should handle a write single coil request with value true', function (done) {

      var cb = function (resp, err) {
        assert.ok(resp);
	assert.deepEqual(resp, {
	  fc: 5,
	  byteCount: 4,
	  outputAddress: 15,
	  outputValue: true
        });

	done();
      };

      client.writeSingleCoil(15, true, cb);

      var res = Put().word16be(0).word16be(0).word16be(7).word8(1)  // header
		.word8(5)         // function code
		.word8(4)         // byte count
		.word16be(15)     // output address
		.word16be(0xFF00) // on 
		.buffer();

      onData(res);
    });

    it('should handle a write single register request', function (done) {

      var cb = function (resp, err) {
        assert.ok(resp);
  	assert.deepEqual(resp, {
          fc: 6,
	  byteCount: 4,
          registerAddress: 13,
	  registerValue: 42
        });
        done();
      };

      client.writeSingleRegister(13, 42, cb);

      var res = Put().word16be(0).word16be(0).word16be(7).word8(1)   // header
  		 .word8(6)      // function code
                 .word8(4)      // byte count
        	 .word16be(13)  // register address
	   	 .word16be(42)  // register value
		 .buffer();

       onData(res);

    });

  });

});
