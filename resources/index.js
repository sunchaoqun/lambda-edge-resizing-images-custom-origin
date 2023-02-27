'use strict';

const https = require('https');
const Sharp = require('sharp');
const aws = require('aws-sdk');

const keepAliveAgent = new https.Agent({ keepAlive: true });

exports.handler = (event, context, callback) => {

  const request = event.Records[0].cf.request;
  console.log(request);
  // Read the custom origin name Cloudfront for custom 
  
  var resizingOptions = {};
  const params = new URLSearchParams(request.querystring);
  if (!params.has('width') || !params.has('format')) {
    // if there is no width parameter, just pass the request
    console.log("no params");
    callback(null, request);
    return;
  }
  resizingOptions.width = parseInt(params.get('width'));

  if(params.get('height')){
    resizingOptions.height = parseInt(params.get('height'));
  }

  if(request.origin.s3){

    var region_ = request.origin.s3.region;

    var s3 = new aws.S3({'region': region_});

    var originname = request.origin.s3.domainName;

    var s3DomainEnd = '.s3' + '.' + region_ + '.amazonaws.com';

    console.log(originname.indexOf(s3DomainEnd));

    if (!originname.indexOf(s3DomainEnd)>0) {
      callback(null, request);
      return;
    }

    var _bucket = originname.replace(s3DomainEnd, '');
    var _key = request.uri.replace(/\//, '');

    console.log(_bucket);
    console.log(_key);

    if ((_bucket) && (_key)){
  
        let chunks = [];
  
        s3.getObject({
          Bucket: _bucket, 
          Key: _key
        }).on('httpData', function (chunk) {
          chunks.push(Buffer.from(chunk, 'binary'));
        }).on('httpDone', function () {
          const binary = Buffer.concat(chunks);
          try {
            // Generate a response with resized image
            Sharp(binary)
              .resize(resizingOptions)
              .toFormat(params.get('format'))
              .toBuffer()
              .then(output => {
                const base64String = output.toString('base64');
                console.log("Length of response :%s", base64String.length);
                if (base64String.length > 1048576) {
                  //Resized filesize payload is greater than 1 MB.Returning original image
                  console.error('Resized filesize payload is greater than 1 MB.Returning original image');
                  callback(null, request);
                  return;
                }
  
                const response = {
                  status: '200',
                  statusDescription: 'OK',
                  headers: {
                    'cache-control': [{
                      key: 'Cache-Control',
                      value: 'max-age=86400'
                    }],
                    'content-type': [{
                      key: 'Content-Type',
                      value: 'image/' + params.get('format')
                    }]
                  },
                  bodyEncoding: 'base64',
                  body: base64String
                };
  
                callback(null, response);
              }).catch(sharpErr =>{
                console.log("sharpErr S3: ", sharpErr);
                callback(null, request);
                return; 
              });
          } catch (err) {
            // Image resize error
            console.error(err);
            callback(null, request);
            return;
          }
        }).send();
    }
  } else {
    var originname = request.origin.custom.domainName;

    const options = {
      hostname: originname,
      port: 443,
      path: request.uri,
      method: 'GET',
      encoding: null,
      agent: keepAliveAgent
    }
    const req = https.request(options, function (res) {
      console.log(`statusCode: ${res.statusCode}`)
      console.log(options);
      console.log(params.get('format'));
      let chunks = [];
      res
        .on('data', (chunk) => {
          chunks.push(Buffer.from(chunk, 'binary'));
        })
        .on('end', () => {
          // Check the state code is 200 and file extension is jpg
          //if (res.statusCode !== 200 || !request.uri.endsWith('\.jpg')) {
          if (res.statusCode !== 200 ) {
            req.destroy();
            callback(null, request);
            return;
          }
          const binary = Buffer.concat(chunks);
          try {
            // Generate a response with resized image
            Sharp(binary)
              .resize(resizingOptions)
              .toFormat(params.get('format'))
              .toBuffer()
              .then(output => {
                const base64String = output.toString('base64');
                console.log("Length of response :%s", base64String.length);
                if (base64String.length > 1048576) {
                  //Resized filesize payload is greater than 1 MB.Returning original image
                  console.error('Resized filesize payload is greater than 1 MB.Returning original image');
                  callback(null, request);
                  return;
                }

                const response = {
                  status: '200',
                  statusDescription: 'OK',
                  headers: {
                    'cache-control': [{
                      key: 'Cache-Control',
                      value: 'max-age=86400'
                    }],
                    'content-type': [{
                      key: 'Content-Type',
                      value: 'image/' + params.get('format')
                    }]
                  },
                  bodyEncoding: 'base64',
                  body: base64String
                };
                callback(null, response);
              }).catch(sharpErr =>{
                console.log("sharpErr CF: ", sharpErr);
                callback(null, request);
                return; 
              });
          } catch (err) {
            // Image resize error
            console.error(err);
            callback(null, request);
          } finally {
            req.destroy();
          }
        });
    })
    req.end()
  }

}