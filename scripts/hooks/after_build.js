/**
 Copyright (c) 2015, 2024, Oracle and/or its affiliates.
 Licensed under The Universal Permissive License (UPL), Version 1.0
 as shown at https://oss.oracle.com/licenses/upl/
 */
'use strict';

const path = require('path');
const fs = require('fs');

const WEB_ROOT = path.join(__dirname, '../..', 'web');
const INDEX_HTML = path.join(WEB_ROOT, 'index.html');
const LANDING_ROOT = path.join(WEB_ROOT, 'landing');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function copyDirIfExists(src, dest) {
    if (!fs.existsSync(src)) {
        console.log(`[after_build] skip copy; missing: ${src}`);
        return;
    }
    ensureDir(dest);
    // Node 18+ supports cpSync
    fs.cpSync(src, dest, { recursive: true, force: true });
    console.log(`[after_build] copied ${src} -> ${dest}`);
}

function rewriteIndexPaths() {
    if (!fs.existsSync(INDEX_HTML)) {
        throw new Error(`index.html not found: ${INDEX_HTML}`);
    }

    let html = fs.readFileSync(INDEX_HTML, 'utf-8');

    html = html
        .replace(/(src|href)=["']\.?\/js\//g, '$1="./landing/js/')
        .replace(/(src|href)=["']js\//g, '$1="landing/js/')
        .replace(/(src|href)=["']\.?\/styles\//g, '$1="./landing/styles/')
        .replace(/(src|href)=["']styles\//g, '$1="landing/styles/');

    fs.writeFileSync(INDEX_HTML, html, 'utf-8');
    console.log('[after_build] index.html asset paths rewritten');
}

module.exports = function (configObj) {
    return new Promise((resolve, reject) => {
        try {
            console.log(`[after_build] WEB_ROOT=${WEB_ROOT}`);

            ensureDir(LANDING_ROOT);

            copyDirIfExists(path.join(WEB_ROOT, 'js'), path.join(LANDING_ROOT, 'js'));
            copyDirIfExists(path.join(WEB_ROOT, 'styles'), path.join(LANDING_ROOT, 'styles'));

            rewriteIndexPaths();

            resolve(configObj);
        } catch (e) {
            console.log(`\t[after_build]: ${e}`);
            reject(e);
        }
    });
};