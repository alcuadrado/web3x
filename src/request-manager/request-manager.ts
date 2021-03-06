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

import { isArray } from 'util';
import * as Jsonrpc from './jsonrpc';
import { givenProvider } from './givenProvider';
import { Provider } from '../providers';
import { ErrorResponse, InvalidResponse } from '../errors';

export interface IRequestManager {
  send(data, callback?): Promise<any>;
  sendBatch(data, callback);
  supportsSubscriptions(): boolean;
  addSubscription(id, name, type, callback);
  removeSubscription(id, callback?);
  clearSubscriptions(keepIsSyncing: boolean);
  close();
}

/**
 * It's responsible for passing messages to providers
 * It's also responsible for polling the ethereum node for incoming messages
 * Default poll timeout is 1 second
 * Singleton
 */
export class RequestManager {
  private subscriptions: any;
  public static givenProvider = givenProvider;

  constructor(public provider: Provider) {
    // listen to incoming notifications
    if (this.provider && this.provider.on) {
      this.provider.on('data', (result, deprecatedResult) => {
        result = result || deprecatedResult;

        // check for result.method, to prevent old providers errors to pass as result
        if (
          result.method &&
          this.subscriptions[result.params.subscription] &&
          this.subscriptions[result.params.subscription].callback
        ) {
          this.subscriptions[result.params.subscription].callback(null, result.params.result);
        }
      });
    }

    this.subscriptions = {};
  }

  /**
   * Should be used to asynchronously send request
   *
   * @method sendAsync
   * @param {Object} data
   */
  async send(data): Promise<any> {
    return new Promise((resolve, reject) => {
      const payload = Jsonrpc.toPayload(data.method, data.params);
      this.provider.send(payload, function(err, result) {
        if (err) {
          return reject(err);
        } else if (!result) {
          return reject(new Error('No result.'));
        } else if (result.id && payload.id !== result.id) {
          return reject(
            new Error(
              'Wrong response id "' + result.id + '" (expected: "' + payload.id + '") in ' + JSON.stringify(payload),
            ),
          );
        } else if (result.error) {
          return reject(ErrorResponse(result));
        } else if (!Jsonrpc.isValidResponse(result)) {
          return reject(InvalidResponse(result));
        }

        resolve(result.result);
      });
    });
  }

  /**
   * Should be called to asynchronously send batch request
   *
   * @method sendBatch
   * @param {Array} batch data
   */
  sendBatch(data): Promise<any> {
    return new Promise((resolve, reject) => {
      const payload = Jsonrpc.toBatchPayload(data);
      this.provider.send(payload, function(err, results) {
        if (err) {
          return reject(err);
        }

        if (!isArray(results)) {
          return reject(InvalidResponse(results));
        }

        resolve(results);
      });
    });
  }

  /**
   * Waits for notifications
   *
   * @method addSubscription
   * @param {String} id           the subscription id
   * @param {String} name         the subscription name
   * @param {String} type         the subscription namespace (eth, personal, etc)
   * @param {Function} callback   the callback to call for incoming notifications
   */
  addSubscription(id, name, type, callback) {
    if (this.provider.on) {
      this.subscriptions[id] = {
        callback: callback,
        type: type,
        name: name,
      };
    } else {
      throw new Error("The provider doesn't support subscriptions: " + this.provider.constructor.name);
    }
  }

  /**
   * Waits for notifications
   *
   * @method removeSubscription
   * @param {String} id           the subscription id
   * @param {Function} callback   fired once the subscription is removed
   */
  removeSubscription(id) {
    var _this = this;

    if (this.subscriptions[id]) {
      this.send({
        method: this.subscriptions[id].type + '_unsubscribe',
        params: [id],
      });

      // remove subscription
      delete _this.subscriptions[id];
    }
  }

  /**
   * Should be called to reset the subscriptions
   *
   * @method reset
   */
  clearSubscriptions(keepIsSyncing: boolean = false) {
    var _this = this;

    // uninstall all subscriptions
    Object.keys(this.subscriptions).forEach(function(id) {
      if (!keepIsSyncing || _this.subscriptions[id].name !== 'syncing') _this.removeSubscription(id);
    });

    //  reset notification callbacks etc.
    if (this.provider.reset) this.provider.reset();
  }

  close() {
    this.provider.disconnect();
  }

  supportsSubscriptions() {
    return !!this.provider.on;
  }
}
