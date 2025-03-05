
// export async function collectFunds(wallets: any) {
//   console.log(`开始归集资金到 ${TARGET_ADDRESS}...`);

//   for (const walletData of wallets) {
//     try {
//       const wallet = new ethers.Wallet(walletData.privateKey, provider);
//       const balance = await provider.getBalance(wallet.address);
//       console.log(
//         `地址 ${wallet.address} 余额: ${ethers.formatEther(balance)} ETH`
//       );

//       if (balance > 0n) {
//         const gasPrice = (await provider.getFeeData()).gasPrice;
//         const gasLimit = 21000n; // 标准转账 gas limit
//         const gasCost = gasPrice * gasLimit;
//         const value = balance - gasCost;

//         if (value <= 0n) {
//           console.log(`地址 ${wallet.address} 余额不足以支付 gas 费用，跳过`);
//           continue;
//         }

//         const tx = {
//           to: TARGET_ADDRESS,
//           value: value,
//           gasLimit: gasLimit,
//           gasPrice: gasPrice,
//         };

//         const txResponse = await wallet.sendTransaction(tx);
//         console.log(`地址 ${wallet.address} 归集交易发送: ${txResponse.hash}`);
//         await txResponse.wait();
//         console.log(`地址 ${wallet.address} 归集完成`);
//       } else {
//         console.log(`地址 ${wallet.address} 无余额，跳过`);
//       }
//     } catch (e) {
//       console.error(`地址 ${wallet.address} 归集失败:`, e.message);
//     }
//   }
//   console.log('所有地址归集完成');
// }