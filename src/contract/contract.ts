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

import { isArray, isFunction } from 'util';
import { Subscription } from '../subscriptions';
import { abi, abiMethodToString } from './abi';
import { Tx, TxFactory, TxSend, TxCall } from './tx';
import { decodeAnyEvent } from './decode-event-abi';
import {
  inputAddressFormatter,
  EventLog,
  inputBlockNumberFormatter,
  inputLogFormatter,
  TransactionReceipt,
} from '../formatters';
import { toChecksumAddress, isAddress } from '../utils';
import { TxDeploy } from './tx-deploy';
import { ContractAbi, AbiDefinition } from './contract-abi';
import { Address, Data } from '../types';
import { BlockType } from '../types';
import { Eth } from '../eth';
import { InvalidNumberOfParams } from '../errors';
import { Wallet } from '../accounts';

export interface ContractOptions {
  from?: string;
  gasPrice?: string;
  gas?: number;
}

interface ContractDefinition {
  methods: any;
  events?: any;
  eventLogs?: any;
}

export type EventSubscriptionFactory<Result = EventLog<any>> = (
  options?: object,
  callback?: (err: Error, result: Result, subscription: Subscription<Result>) => void,
) => Subscription<Result>;

type Events<T extends ContractDefinition | void> = T extends ContractDefinition
  ? Extract<keyof T['events'], string>
  : string;

type GetEventLog<T extends ContractDefinition | void, P extends Events<T>> = T extends ContractDefinition
  ? T['eventLogs'][P]
  : EventLog<any>;

type GetContractMethods<T> = T extends ContractDefinition ? T['methods'] : { [key: string]: (...args: any[]) => Tx };

type GetContractEvents<T> = T extends ContractDefinition
  ? T['events'] & { allEvents: EventSubscriptionFactory<T['eventLogs'][Events<T>]> }
  : { [key: string]: EventSubscriptionFactory };

/**
 * Should be called to create new contract instance
 *
 * @method Contract
 * @constructor
 * @param {Array} jsonInterface
 * @param {String} address
 * @param {Object} options
 */
export class Contract<T extends ContractDefinition | void = void> {
  readonly methods: GetContractMethods<T>;
  readonly events: GetContractEvents<T>;
  private options: ContractOptions;
  private extraFormatters;

  constructor(
    private eth: Eth,
    private jsonInterface: ContractAbi,
    public address?: string,
    defaultOptions: ContractOptions = {},
    private wallet?: Wallet,
  ) {
    this.jsonInterface = this.getEnrichedAbiDefinition(jsonInterface);
    this.methods = this.getMethods(this.jsonInterface);
    this.events = this.getEvents(this.jsonInterface);

    const { gasPrice, from, gas } = defaultOptions;
    this.options = {
      gas,
      gasPrice,
      from: from ? toChecksumAddress(inputAddressFormatter(from)) : undefined,
    };

    if (address) {
      this.setAddress(address);
    }

    this.extraFormatters = {
      receiptFormatter: this.receiptFormatter,
      contractDeployFormatter: this.contractDeployFormatter,
    };
  }

  /**
   * Deploys a contract and fire events based on its state: transactionHash, receipt
   * contract.deploy(data, 1, 2).send({ from: 0x123... });
   *
   * All event listeners will be removed, once the last possible event is fired ("error", or "receipt")
   */
  deploy(data: Data, ...args: any[]) {
    const constructor: AbiDefinition = this.jsonInterface.find(method => method.type === 'constructor') || {
      type: 'constructor',
    };
    constructor.signature = 'constructor';

    return new TxDeploy(this.eth, constructor, data, args, this.options, this.wallet, this.extraFormatters);
  }

  once<Event extends Events<T>>(
    event: Event,
    options: {
      filter?: object;
      topics?: string[];
    },
    callback: (err, res: GetEventLog<T, Event>, sub) => void,
  );

  /**
   * Adds event listeners and creates a subscription, and remove it once its fired.
   *
   * @method once
   * @param {String} event
   * @param {Object} options
   * @param {Function} callback
   * @return {Object} the event subscription
   */
  once(
    event: Events<T>,
    options: {
      filter?: object;
      topics?: string[];
    },
    callback: (err, res, sub) => void,
  ) {
    // don't return as once shouldn't provide "on"
    this.on(event, options, (err, res, sub) => {
      sub.unsubscribe();
      callback(err, res, sub);
    });
  }

  getPastEvents<Event extends Events<T>>(
    event: Event,
    options: {
      filter?: object;
      fromBlock?: BlockType;
      toBlock?: BlockType;
      topics?: string[];
    },
  ): Promise<GetEventLog<T, Event>[]>;

  /**
   * Get past events from contracts
   *
   * @method getPastEvents
   * @param {String} event
   * @param {Object} options
   * @param {Function} callback
   * @return {Object} the promievent
   */
  async getPastEvents(
    event: Events<T>,
    options: {
      filter?: object;
      fromBlock?: BlockType;
      toBlock?: BlockType;
      topics?: string[];
    } = {},
  ): Promise<EventLog<any>[]> {
    const subOptions = this.generateEventOptions(event, options);
    const result = await this.eth.getPastLogs(subOptions.params);
    return result.map(log => decodeAnyEvent(this.jsonInterface, log));
  }

  private executorFactory(definition: AbiDefinition, nextOverload?: TxFactory): TxFactory {
    return (...args: any[]): Tx => {
      if (!this.address) {
        throw new Error('No contract address.');
      }
      if (
        (!args && definition.inputs && definition.inputs.length > 0) ||
        (definition.inputs && args.length !== definition.inputs.length)
      ) {
        if (nextOverload) {
          return nextOverload(...args);
        }
        throw InvalidNumberOfParams(args.length, definition.inputs.length, definition.name);
      }
      return new Tx(this.eth, definition, this.address, args, this.options, this.wallet, this.extraFormatters);
    };
  }

  private setAddress(address: Address) {
    this.address = toChecksumAddress(inputAddressFormatter(address));
  }

  private getMethods(contractDefinition: ContractAbi) {
    const methods: any = {};

    contractDefinition.filter(method => method.type === 'function').forEach(method => {
      const name = method.name!;
      const funcName = abiMethodToString(method);
      method.signature = abi.encodeFunctionSignature(funcName);
      const func = this.executorFactory(method);

      // add method only if not one already exists
      if (!methods[name]) {
        methods[name] = func;
      } else {
        const cascadeFunc = this.executorFactory(method, methods[name]);
        methods[name] = cascadeFunc;
      }

      // definitely add the method based on its signature
      methods[method.signature!] = func;

      // add method by name
      methods[funcName] = func;
    });

    return methods;
  }

  private getEvents(contractDefinition: ContractAbi) {
    const events: any = {};

    contractDefinition.filter(method => method.type === 'event').forEach(method => {
      const name = method.name!;
      const funcName = abiMethodToString(method);
      const event = this.on.bind(this, method.signature);

      // add method only if not already exists
      if (!events[name] || events[name].name === 'bound ') events[name] = event;

      // definitely add the method based on its signature
      events[method.signature!] = event;

      // add event by name
      events[funcName] = event;
    });

    // add allEvents
    events.allEvents = this.on.bind(this, 'allevents');

    return events;
  }

  private getEnrichedAbiDefinition(contractDefinition: ContractAbi) {
    return contractDefinition.map(method => {
      // make constant and payable backwards compatible
      const constant = method.stateMutability === 'view' || method.stateMutability === 'pure' || method.constant;
      const payable = method.stateMutability === 'payable' || method.payable;

      method = {
        ...method,
        constant,
        payable,
      };

      // function
      if (method.type === 'function') {
        method = {
          ...method,
          signature: abi.encodeFunctionSignature(abiMethodToString(method)),
        };
      } else if (method.type === 'event') {
        method = {
          ...method,
          signature: abi.encodeEventSignature(abiMethodToString(method)),
        };
      }

      return method;
    });
  }

  /**
   * Checks that no listener with name "newListener" or "removeListener" is added.
   *
   * @method _checkListener
   * @param {String} type
   * @param {String} event
   * @return {Object} the contract instance
   */
  private checkListener(type, event) {
    if (event === type) {
      throw new Error('The event "' + type + '" is a reserved event name, you can\'t use it.');
    }
  }

  /**
   * Should be used to encode indexed params and options to one final object
   *
   * @method _encodeEventABI
   * @param {Object} event
   * @param {Object} options
   * @return {Object} everything combined together and encoded
   */
  private encodeEventABI(event, options) {
    options = options || {};
    var filter = options.filter || {},
      result: any = {};

    ['fromBlock', 'toBlock']
      .filter(f => {
        return options[f] !== undefined;
      })
      .forEach(f => {
        result[f] = inputBlockNumberFormatter(options[f]);
      });

    // use given topics
    if (isArray(options.topics)) {
      result.topics = options.topics;

      // create topics based on filter
    } else {
      result.topics = [];

      // add event signature
      if (event && !event.anonymous && event.name !== 'ALLEVENTS') {
        result.topics.push(event.signature);
      }

      // add event topics (indexed arguments)
      if (event.name !== 'ALLEVENTS') {
        var indexedTopics = event.inputs
          .filter(i => {
            return i.indexed === true;
          })
          .map(i => {
            var value = filter[i.name];
            if (!value) {
              return null;
            }

            // TODO: https://github.com/ethereum/web3x/issues/344
            // TODO: deal properly with components

            if (isArray(value)) {
              return value.map(v => {
                return abi.encodeParameter(i.type, v);
              });
            }
            return abi.encodeParameter(i.type, value);
          });

        result.topics = result.topics.concat(indexedTopics);
      }

      if (!result.topics.length) delete result.topics;
    }

    if (this.address) {
      result.address = this.address.toLowerCase();
    }

    return result;
  }

  /**
   * Gets the event signature and outputformatters
   *
   * @method _generateEventOptions
   * @param {Object} event
   * @param {Object} options
   * @param {Function} callback
   * @return {Object} the event options object
   */
  private generateEventOptions(eventName: string = 'allevents', options, callback?) {
    let event: any =
      eventName.toLowerCase() === 'allevents'
        ? {
            name: 'ALLEVENTS',
            jsonInterface: this.jsonInterface,
          }
        : this.jsonInterface.find(json => {
            return (
              json.type === 'event' &&
              (json.name === eventName || json.signature === '0x' + eventName.replace('0x', ''))
            );
          });

    if (!event) {
      throw new Error('Event "' + event.name + '" doesn\'t exist in this contract.');
    }

    if (!isAddress(this.address)) {
      throw new Error("This contract object doesn't have address set yet, please set an address first.");
    }

    return {
      params: this.encodeEventABI(event, options),
      event: event,
      callback: callback,
    };
  }

  /**
   * Adds event listeners and creates a subscription.
   *
   * @method _on
   * @param {String} event
   * @param {Object} options
   * @param {Function} callback
   * @return {Object} the event subscription
   */
  private on(event, options, callback) {
    var subOptions = this.generateEventOptions(event, options, callback);

    // prevent the event "newListener" and "removeListener" from being overwritten
    this.checkListener('newListener', subOptions.event.name);
    this.checkListener('removeListener', subOptions.event.name);

    // TODO check if listener already exists? and reuse subscription if options are the same.

    // create new subscription
    var subscription = new Subscription({
      subscription: {
        params: 1,
        inputFormatter: [inputLogFormatter],
        outputFormatter: log => decodeAnyEvent(this.jsonInterface, log),
        // DUBLICATE, also in web3-eth
        subscriptionHandler: function(output) {
          if (output.removed) {
            this.emit('changed', output);
          } else {
            this.emit('data', output);
          }

          if (isFunction(this.callback)) {
            this.callback(null, output, this);
          }
        },
      },
      type: 'eth',
      requestManager: this.eth.requestManager,
    });
    subscription.subscribe('logs', subOptions.params, subOptions.callback || function() {});

    return subscription;
  }

  private contractDeployFormatter = receipt => {
    this.setAddress(receipt.contractAddress);
    return receipt;
  };

  private receiptFormatter = (receipt: TransactionReceipt) => {
    if (!isArray(receipt.logs)) {
      return receipt;
    }

    // decode logs
    const decodedEvents = receipt.logs.map(log => decodeAnyEvent(this.jsonInterface, log));

    // make log names keys
    receipt.events = {};
    receipt.unnamedEvents = [];
    var count = 0;
    for (let ev of decodedEvents) {
      if (ev.event) {
        const events = receipt.events[ev.event] || [];
        receipt.events[ev.event] = [...events, ev];
      } else {
        receipt.unnamedEvents = [...receipt.unnamedEvents, ev];
        count++;
      }
    }
    delete receipt.logs;

    return receipt;
  };
}
