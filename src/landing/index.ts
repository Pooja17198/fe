/**
 * @license
 * Copyright (c) 2014, 2024, Oracle and/or its affiliates.
 * Licensed under The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
// injector:preactDebugImport
// endinjector
import './components/app';

function convertStringToObject(input: string) {
    // Remove the surrounding semicolon
    const pairs = input.split('; ');
    const result: {} = {};

    // Iterate over the pairs and split them into key and value
    pairs.forEach((pair: string) => {
      const [key, value] = pair.split('=');
      // @ts-ignore
      result[key] = value;
      sessionStorage.setItem(key, value);
    });

    return result;
  }

let cookies = convertStringToObject(document.cookie);
console.log(cookies);