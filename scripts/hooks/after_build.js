/**
 Copyright (c) 2015, 2024, Oracle and/or its affiliates.
 Licensed under The Universal Permissive License (UPL), Version 1.0
 as shown at https://oss.oracle.com/licenses/upl/

 */

'use strict';
const replaceInFile = require('replace-in-file');
const path = require('path');
const fs = require('fs');
const WEB_ROOT = path.join(__dirname, '../..', 'web');
console.log(WEB_ROOT);

function replaceTextInFile({paths, from, to,}) {
    const replaceOptions = {
        files: [...paths],
        from: from,
        to: to,
        countMatches: true,
    };
    const replaceResults = replaceInFile.sync(replaceOptions);
    if(replaceResults.length !== 1) {
        throw new Error('Failed to get file for replace')
    } else {
        console.log('Completed' + replaceResults.length);
    }
}

async function replaceSrcInIndexHtml() {
    // replace if any src with double quotes

        replaceTextInFile({
            paths: [path.join(WEB_ROOT, 'index.html')],
            from: "<script type='text/javascript' src='./bundle.js'></script>",
            to: "<script type='text/javascript' src='./landing/bundle.js'></script>",
        });

}

async function moveBundleToIndexHtml() {
    const sourceFilePath = path.join(WEB_ROOT, './bundle.js');
    const destinationFilePath = path.join(WEB_ROOT, './landing/bundle.js');

    // Use fs.copyFile to copy the file
    fs.rename(sourceFilePath, destinationFilePath, (err) => {
        if (err) {
            console.error('Error copying file:', err);
        } else {
            console.log('File copied successfully!');
        }
    });
}

module.exports = function(configObj) {
    return new Promise(async (resolve, reject) => {
        try {
            console.log("Running after_build hook.");
            const fileContents = fs.readFileSync(path.join(WEB_ROOT, 'index.html'), "utf-8");

            // Check if the searchString exists in the file contents
            if (fileContents.includes("<script type='text/javascript' src='./bundle.js'>")) {
                await replaceSrcInIndexHtml();
                await moveBundleToIndexHtml();
            }
            resolve(configObj);
        } catch(e) {
            console.log(`\t[after_build]: ${e}`)
        }
    });
};
