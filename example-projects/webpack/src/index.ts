import { WebsocketProvider } from 'web3x-es/providers';
import { Eth } from 'web3x-es/eth';
import { fromWei, toWei } from 'web3x-es/utils';
import { Wallet } from 'web3x-es/accounts';
import { Net } from 'web3x-es/net';
import { Address } from 'web3x-es/types';
import { ENS } from 'web3x-es/ens';
import { DaiContract } from './contracts/DaiContract';

declare const web3: any;

/*
  Demonstrates how to create a minimally sized build. If you only need to provide access to Ethereum calls over a
  websocket connection, with no local accounts (e.g. interfacing with Metamask or a remote node with accounts),
  then it makes no sense to bundle all the crypto/provider/accounts code with your app. Construct only
  the components you need and keep things lean.

  Demonstrates use of a code generated contract with full type safety.
*/
async function main() {
  const eth = Eth.fromProvider(web3.currentProvider || new WebsocketProvider('ws://localhost:8546'));
  const net = new Net(eth);
  const network = await net.getNetworkType();

  // For poking around in console.
  (window as any).eth = eth;

  addMessage(`Connected to network: ${network}`);
  addMessage(`Network Id: ${await eth.getId()}`);
  addMessage(`Provider info: ${await eth.getNodeInfo()}`);

  // Work with a code generated contract.
  await addDaiBalance(eth);

  if (network === 'main') {
    addMessage('Join a testnet to test sending transactions.');
    addBr();
  } else {
    await addSendingExamples(eth);
  }

  // Work with ENS.
  await addEnsExamples(eth);
}

async function addSendingExamples(eth: Eth) {
  const providerAddress = (await eth.getAccounts())[0];

  if (!providerAddress) {
    addMessage('No account returned from provider. Is provider unlocked?');
    return;
  }

  eth.request.setDefaultAccount(providerAddress);
  const providerBalance = await eth.getBalance(providerAddress);
  addMessage(`Balance of provider account: ${fromWei(providerBalance, 'ether')} ETH`);
  addBr();

  addMessage('The following button will send ETH from provider account to itself.');
  addSendTo(eth, providerAddress, providerAddress);
  addBr();

  // Assuming you want some local accounts to work with, construct them yourself.
  // Webpack output: ~338kb
  const wallet = (await Wallet.fromLocalStorage(eth, 'my_password')) || new Wallet(eth);
  if (!wallet.length) {
    wallet.create(1);
    await wallet.save('my_password');
  }

  // Make eth aware of wallet so it can use accounts for sending etc.
  // Alternatively you can use sendTransaction directly on Account object.
  eth.wallet = wallet;

  const walletAccount = wallet.get(0)!;
  const localBalance = await eth.getBalance(wallet.get(0)!.address);
  addMessage(`Balance of local account: ${fromWei(localBalance, 'ether')} ETH`);

  addMessage('The following button will send ETH from provider account to local account.');
  addSendTo(eth, providerAddress, walletAccount.address);
  addBr();

  addMessage('The following button will send ETH from local account to provider account.');
  addSendTo(eth, walletAccount.address, providerAddress);
  addBr();
}

async function addSendTo(eth: Eth, from: Address, to: Address) {
  const button = document.createElement('button');
  button.onclick = () => send(eth, from, to);
  button.textContent = `Send 0.01 ETH`;
  document.body.appendChild(button);
  addBr();
}

function addBr() {
  document.body.appendChild(document.createElement('br'));
}

async function send(eth: Eth, from: Address, to: Address) {
  await eth
    .sendTransaction({
      value: toWei('0.01', 'ether'),
      from,
      to,
      gas: 50000,
    })
    .on('transactionHash', txHash => addMessage(`Sent transaction ${txHash}`))
    .on('receipt', async receipt => {
      addMessage(`Transaction complete for ${receipt.transactionHash}.`);
      addMessage(`New 'from' balance: ${fromWei(await eth.getBalance(from), 'ether')}`);
      addMessage(`New 'to' balance: ${fromWei(await eth.getBalance(to), 'ether')}`);
      addBr();
    })
    .on('error', err => addMessage(err.message));
}

async function addDaiBalance(eth: Eth) {
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  const DAI_CONTRACT_ADDRESS = '0xc4375b7de8af5a38a93548eb8453a498222c4ff2';

  try {
    const contract = new DaiContract(eth, DAI_CONTRACT_ADDRESS, { from: eth.request.getDefaultAccount() });
    const daiBalance = await contract.methods.balanceOf(ZERO_ADDRESS).call();
    addMessage(`Balance of DAI 0 address: ${fromWei(daiBalance, 'ether')}`);
    addBr();
  } catch (_) {
    addMessage('Failed to get DAI 0 address balance, probably not on kovan?');
    addBr();
  }
}

async function addEnsExamples(eth: Eth) {
  try {
    const ens = new ENS(eth);
    const address = await ens.getAddress('ethereum.eth');
    addMessage(`The ENS address ethereum.eth resolves to ${address}`);
    addBr();
  } catch (err) {
    addMessage(err.stack);
  }
}

function addMessage(msg: string) {
  const div = document.createElement('div');
  div.innerText = msg;
  document.body.appendChild(div);
}

main().catch(console.error);
