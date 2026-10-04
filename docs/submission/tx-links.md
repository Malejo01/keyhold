# Devnet transaction links

Real Solana **devnet** transactions produced by `scripts/record-demo-txs.ts` through the same
`executePayment` code path the app uses. Escrow is custodial in this phase: the deposit goes to the
platform custody wallet, rent goes straight to the landlord. The platform wallet pays every fee.

- Demo lease id: `demo-bec00d360594` (opaque; no personal data)
- Contract text: `Tuki demo lease demo-bec00d360594. Sample text for the hackathon recording; no personal data.`
- Contract sha256: `2fa01fbcf7b843f558405dcfda5a6a5a228e28ca87c20312f157d5313098da63`
- tUSDC mint: [GiCyZLFrkhKd3X4CpFGe4sMHB2kiPob5ToH8FtjYou7X](https://explorer.solana.com/address/GiCyZLFrkhKd3X4CpFGe4sMHB2kiPob5ToH8FtjYou7X?cluster=devnet)
- Platform custody wallet: [4sroL1aFi7iYZR2MWUMkZFacrnUkvrBG9EH7JtvSrzQm](https://explorer.solana.com/address/4sroL1aFi7iYZR2MWUMkZFacrnUkvrBG9EH7JtvSrzQm?cluster=devnet)
- Landlord wallet: [DyhutJsmAQVMdmYkSmE4QHVQjqD5zEpfpbci1pNwqbna](https://explorer.solana.com/address/DyhutJsmAQVMdmYkSmE4QHVQjqD5zEpfpbci1pNwqbna?cluster=devnet)

| Payment | Amount | Discount | On time (blockTime) | Explorer |
| --- | --- | --- | --- | --- |
| Deposit (tenant -> custody) | 400 tUSDC | 0% | true | [tx](https://explorer.solana.com/tx/4dz9mT4azfqBkgL5NgPSm3c3yGBePjLTtmPqYTxsJHuiY6tWaBskYufT3spgkH5QK2m49NwkwePpzgMUv37gP1LT?cluster=devnet) |
| Rent, month 0 (tenant -> landlord) | 380 tUSDC | 5% | true | [tx](https://explorer.solana.com/tx/5oQUuv3pk3Lcctk8gQHAhFMnPcZYh9sXGEpYokkMxwEQEywWrfHC8S4aX8FSHSDBEuRxmrLegQjx81zVGAjK7V5?cluster=devnet) |

Memos (verified on chain: trailing hash equals the contract sha256):

- `tuki:lease:demo-bec00d360594:deposit:2fa01fbcf7b843f558405dcfda5a6a5a228e28ca87c20312f157d5313098da63`
- `tuki:lease:demo-bec00d360594:rent:0:2fa01fbcf7b843f558405dcfda5a6a5a228e28ca87c20312f157d5313098da63`

Recorded at blockTime 1791077266 (unix seconds).
