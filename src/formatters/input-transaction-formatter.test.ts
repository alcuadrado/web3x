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

import { inputTransactionFormatter } from './input-transaction-formatter';

const tests = [
  {
    input: {
      data: '0x34234bf23bf4234',
      value: '100',
      from: '0x11f4d0A3c12e86B4b5F39B213F7E19D048276DAe', // checksum address
      to: '0x11f4d0a3c12e86b4b5f39b213f7e19d048276dae',
      nonce: 1000,
      gas: 1000,
      gasPrice: '1000',
    },
    result: {
      data: '0x34234bf23bf4234',
      value: '0x64',
      from: '0x11f4d0a3c12e86b4b5f39b213f7e19d048276dae',
      to: '0x11f4d0a3c12e86b4b5f39b213f7e19d048276dae',
      nonce: '0x3e8',
      gas: '0x3e8',
      gasPrice: '0x3e8',
    },
  },
  {
    input: {
      data: '0x34234bf23bf4234',
      value: '100',
      from: '00c5496aee77c1ba1f0854206a26dda82a81d6d8',
      to: '0x11f4d0A3c12e86B4b5F39B213F7E19D048276DAe', // checksum address
    },
    result: {
      data: '0x34234bf23bf4234',
      value: '0x64',
      from: '0x00c5496aee77c1ba1f0854206a26dda82a81d6d8',
      to: '0x11f4d0a3c12e86b4b5f39b213f7e19d048276dae',
    },
  },
  {
    input: {
      data: '0x34234bf23bf4234',
      value: '100',
      from: '00c5496aee77c1ba1f0854206a26dda82a81d6d8',
      to: '00c5496aee77c1ba1f0854206a26dda82a81d6d8',
      gas: '1000',
      gasPrice: '1000',
    },
    result: {
      data: '0x34234bf23bf4234',
      value: '0x64',
      from: '0x00c5496aee77c1ba1f0854206a26dda82a81d6d8',
      to: '0x00c5496aee77c1ba1f0854206a26dda82a81d6d8',
      gas: '0x3e8',
      gasPrice: '0x3e8',
    },
  },
  {
    input: {
      data: '0x34234bf23bf4234',
      value: '100',
      from: 'XE7338O073KYGTWWZN0F2WZ0R8PX5ZPPZS',
      to: 'XE7338O073KYGTWWZN0F2WZ0R8PX5ZPPZS',
      gas: '1000',
      gasPrice: '1000',
    },
    result: {
      data: '0x34234bf23bf4234',
      value: '0x64',
      from: '0x00c5496aee77c1ba1f0854206a26dda82a81d6d8',
      to: '0x00c5496aee77c1ba1f0854206a26dda82a81d6d8',
      gas: '0x3e8',
      gasPrice: '0x3e8',
    },
  },
  {
    input: {
      data: '0x34234bf23bf4234',
      value: '100',
      from: 'XE7338O073KYGTWWZN0F2WZ0R8PX5ZPPZS',
      gas: '1000',
      gasPrice: '1000',
    },
    result: {
      data: '0x34234bf23bf4234',
      value: '0x64',
      from: '0x00c5496aee77c1ba1f0854206a26dda82a81d6d8',
      gas: '0x3e8',
      gasPrice: '0x3e8',
    },
  },
];

describe('formatters', () => {
  describe('inputTransactionFormatter', function() {
    tests.forEach(function(test) {
      it('should return the correct value', function() {
        expect(inputTransactionFormatter(test.input)).toEqual(test.result);
      });
    });
  });
});
