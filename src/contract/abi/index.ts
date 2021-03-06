/*
  This file is part of web3x.

  web3x is free software: you can redistribute it and/or modify
  it under the terms of the GNU Lesser General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  web3x is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Lesser General Public License for more details.

  You should have received a copy of the GNU Lesser General Public License
  along with web3x.  If not, see <http://www.gnu.org/licenses/>.
*/

import { isArray, isObject } from 'util';
import { sha3 } from '../../utils';
import { AbiCoder as EthersAbi } from '../../ethers/abi-coder';

/**
 * ABICoder prototype should be used to encode/decode solidity params of any type
 */
export class ABICoder {
  private ethersAbiCoder: EthersAbi;

  constructor() {
    this.ethersAbiCoder = new EthersAbi(function(type, value) {
      if (type.match(/^u?int/) && !isArray(value) && (!isObject(value) || value.constructor.name !== 'BN')) {
        return value.toString();
      }
      return value;
    });
  }

  /**
   * Encodes the function name to its ABI representation, which are the first 4 bytes of the sha3 of the function name including  types.
   *
   * @method encodeFunctionSignature
   * @param {String|Object} functionName
   * @return {String} encoded function name
   */
  encodeFunctionSignature(functionName) {
    if (isObject(functionName)) {
      functionName = abiMethodToString(functionName);
    }

    return sha3(functionName).slice(0, 10);
  }

  /**
   * Encodes the function name to its ABI representation, which are the first 4 bytes of the sha3 of the function name including  types.
   *
   * @method encodeEventSignature
   * @param {String|Object} functionName
   * @return {String} encoded function name
   */
  encodeEventSignature(functionName) {
    if (isObject(functionName)) {
      functionName = abiMethodToString(functionName);
    }

    return sha3(functionName);
  }

  /**
   * Should be used to encode plain param
   *
   * @method encodeParameter
   * @param {String} type
   * @param {Object} param
   * @return {String} encoded plain param
   */
  encodeParameter(type, param) {
    return this.encodeParameters([type], [param]);
  }

  /**
   * Should be used to encode list of params
   *
   * @method encodeParameters
   * @param {Array} types
   * @param {Array} params
   * @return {String} encoded list of params
   */
  encodeParameters(types, params) {
    return this.ethersAbiCoder.encode(this.mapTypes(types), params);
  }

  /**
   * Encodes a function call from its json interface and parameters.
   *
   * @method encodeFunctionCall
   * @param {Array} jsonInterface
   * @param {Array} params
   * @return {String} The encoded ABI for this function call
   */
  encodeFunctionCall(jsonInterface, params) {
    return (
      this.encodeFunctionSignature(jsonInterface) +
      this.encodeParameters(jsonInterface.inputs, params).replace('0x', '')
    );
  }

  /**
   * Should be used to decode bytes to plain param
   *
   * @method decodeParameter
   * @param {String} type
   * @param {String} bytes
   * @return {Object} plain param
   */
  decodeParameter(type, bytes) {
    return this.decodeParameters([type], bytes)[0];
  }

  /**
   * Should be used to decode list of params
   *
   * @method decodeParameter
   * @param {Array} outputs
   * @param {String} bytes
   * @return {Array} array of plain params
   */
  decodeParameters(outputs, bytes) {
    if (!bytes || bytes === '0x' || bytes === '0X') {
      throw new Error("Returned values aren't valid, did it run Out of Gas?");
    }

    const res = this.ethersAbiCoder.decode(this.mapTypes(outputs), '0x' + bytes.replace(/0x/i, ''));
    const returnValue: any = {};
    returnValue.__length__ = 0;

    outputs.forEach(function(output, i) {
      let decodedValue = res[returnValue.__length__];
      decodedValue = decodedValue === '0x' ? null : decodedValue;

      returnValue[i] = decodedValue;

      if (isObject(output) && output.name) {
        returnValue[output.name] = decodedValue;
      }

      returnValue.__length__++;
    });

    return returnValue;
  }

  /**
   * Decodes events non- and indexed parameters.
   *
   * @method decodeLog
   * @param {Object} inputs
   * @param {String} data
   * @param {Array} topics
   * @return {Array} array of plain params
   */
  decodeLog(inputs, data, topics) {
    topics = isArray(topics) ? topics : [topics];

    data = data || '';

    const notIndexedInputs: any[] = [];
    const indexedParams: any[] = [];
    let topicCount = 0;

    // TODO check for anonymous logs?

    inputs.forEach((input, i) => {
      if (input.indexed) {
        indexedParams[i] = ['bool', 'int', 'uint', 'address', 'fixed', 'ufixed'].find(function(staticType) {
          return input.type.indexOf(staticType) !== -1;
        })
          ? this.decodeParameter(input.type, topics[topicCount])
          : topics[topicCount];
        topicCount++;
      } else {
        notIndexedInputs[i] = input;
      }
    });

    const nonIndexedData = data;
    const notIndexedParams = nonIndexedData ? this.decodeParameters(notIndexedInputs, nonIndexedData) : [];

    const returnValue: any = {};
    returnValue.__length__ = 0;

    inputs.forEach(function(res, i) {
      returnValue[i] = res.type === 'string' ? '' : null;

      if (typeof notIndexedParams[i] !== 'undefined') {
        returnValue[i] = notIndexedParams[i];
      }
      if (typeof indexedParams[i] !== 'undefined') {
        returnValue[i] = indexedParams[i];
      }

      if (res.name) {
        returnValue[res.name] = returnValue[i];
      }

      returnValue.__length__++;
    });

    return returnValue;
  }

  /**
   * Map types if simplified format is used
   *
   * @method mapTypes
   * @param {Array} types
   * @return {Array}
   */
  private mapTypes(types) {
    const mappedTypes: any[] = [];
    types.forEach(type => {
      if (this.isSimplifiedStructFormat(type)) {
        const structName = Object.keys(type)[0];
        mappedTypes.push(
          Object.assign(this.mapStructNameAndType(structName), {
            components: this.mapStructToCoderFormat(type[structName]),
          }),
        );

        return;
      }

      mappedTypes.push(type);
    });

    return mappedTypes;
  }

  /**
   * Check if type is simplified struct format
   *
   * @method isSimplifiedStructFormat
   * @param {string | Object} type
   * @returns {boolean}
   */
  private isSimplifiedStructFormat(type) {
    return typeof type === 'object' && typeof type.components === 'undefined' && typeof type.name === 'undefined';
  }

  /**
   * Maps the correct tuple type and name when the simplified format in encode/decodeParameter is used
   *
   * @method mapStructNameAndType
   * @param {string} structName
   * @return {{type: string, name: *}}
   */
  private mapStructNameAndType(structName) {
    let type = 'tuple';

    if (structName.indexOf('[]') > -1) {
      type = 'tuple[]';
      structName = structName.slice(0, -2);
    }

    return { type: type, name: structName };
  }

  /**
   * Maps the simplified format in to the expected format of the ABICoder
   *
   * @method mapStructToCoderFormat
   * @param {Object} struct
   * @return {Array}
   */
  private mapStructToCoderFormat(struct) {
    const components: any[] = [];
    Object.keys(struct).forEach(key => {
      if (typeof struct[key] === 'object') {
        components.push(
          Object.assign(this.mapStructNameAndType(key), {
            components: this.mapStructToCoderFormat(struct[key]),
          }),
        );

        return;
      }

      components.push({
        name: key,
        type: struct[key],
      });
    });

    return components;
  }
}

/**
 * Should be used to create full function/event name from json abi
 *
 * @method jsonInterfaceMethodToString
 * @param {Object} json
 * @return {String} full function/event name
 */
export function abiMethodToString(json) {
  if (isObject(json) && json.name && json.name.indexOf('(') !== -1) {
    return json.name;
  }

  return json.name + '(' + flattenTypes(false, json.inputs).join(',') + ')';
}

/**
 * Should be used to flatten json abi inputs/outputs into an array of type-representing-strings
 *
 * @method flattenTypes
 * @param {bool} includeTuple
 * @param {Object} puts
 * @return {Array} parameters as strings
 */
function flattenTypes(includeTuple, puts) {
  // console.log("entered _flattenTypes. inputs/outputs: " + puts)
  var types: any[] = [];

  puts.forEach(function(param) {
    if (typeof param.components === 'object') {
      if (param.type.substring(0, 5) !== 'tuple') {
        throw new Error('components found but type is not tuple; report on GitHub');
      }
      var suffix = '';
      var arrayBracket = param.type.indexOf('[');
      if (arrayBracket >= 0) {
        suffix = param.type.substring(arrayBracket);
      }
      var result = flattenTypes(includeTuple, param.components);
      // console.log("result should have things: " + result)
      if (isArray(result) && includeTuple) {
        // console.log("include tuple word, and its an array. joining...: " + result.types)
        types.push('tuple(' + result.join(',') + ')' + suffix);
      } else if (!includeTuple) {
        // console.log("don't include tuple, but its an array. joining...: " + result)
        types.push('(' + result.join(',') + ')' + suffix);
      } else {
        // console.log("its a single type within a tuple: " + result.types)
        types.push('(' + result + ')');
      }
    } else {
      // console.log("its a type and not directly in a tuple: " + param.type)
      types.push(param.type);
    }
  });

  return types;
}

export const abi = new ABICoder();
