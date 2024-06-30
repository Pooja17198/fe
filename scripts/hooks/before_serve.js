/**
  Copyright (c) 2015, 2024, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/

'use strict';

module.exports = function (configObj) {
  /* Write an Express middleware function to inspect the path of the requested 
URL. If the request is for any of the extensions (js, ts, and so on), 
the Express instance handles these requests while other requests are
passed to the app’s index.html file for the JET CoreRouter to manage. 
*/
  // function urlRewriteMiddleware(req, res, next) {
  //   const matchStaticFiles = req.url.match(/(^\/[^.]*$)|(\.html$)/);
  //   req.url = matchStaticFiles ? "/index.html" : req.url;
  //   next();
  // }
  // return new Promise((resolve, reject) => {
  //   /* Call the Express middleware function that inspects the URL to rewrite 
  //      and prepend it to JET’s default middleware so that other options provided 
  //      by JET’s default middleware, such as live reload continue to work. 
  //   */
  //   configObj['preMiddleware'] = [urlRewriteMiddleware]
  //   resolve(configObj);
  // });
  return new Promise((resolve, reject) => {
    console.log('Running before_serve hook.');
    // ojet custom connect and serve options
    // { connectOpts, serveOpts } = configObj;
    // const express = require('express');
    // const http = require('http');
    // pass back custom http
    // configObj['http'] = http;
    // pass back custom express app
    // configObj['express'] = express();
    // pass back custom options for http.createServer
    // const serverOptions = {...};
    // configObj['serverOptions'] = serverOptions;
    // pass back custom server
    // configObj['server'] = http.createServer(serverOptions, express());
    // const tinylr = require('tiny-lr');
    // pass back custom live reload server
    // configObj['liveReloadServer'] = tinylr({ port: PORT });
    // pass back a replacement set of middleware
    // configObj['middleware'] = [...];
    // pass back a set of middleware that goes before the default middleware
    // configObj['preMiddleware'] = [...];
    // pass back a set of middleware that goes after the default middleware
    // configObj['postMiddleware'] = [...];
    resolve(configObj);
  });
};
