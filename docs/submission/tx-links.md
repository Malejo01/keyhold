# Devnet transaction links

Real Solana **devnet** transactions produced by `scripts/record-demo-txs.ts` through the same
`executePayment` code path the app uses. Escrow is custodial in this phase: the deposit goes to the
platform custody wallet, rent goes straight to the landlord. The platform wallet pays every fee.

- Demo lease id: `demo-de2034a10738` (opaque; no personal data)
- Contract text: `Keyhold demo lease demo-de2034a10738. Sample text for the hackathon recording; no personal data.`
- Contract sha256: `360f288876e511122e530f9168b9a84e1afceb181b9ade7bbef8855e873ed69e`
- tUSDC mint: [GiCyZLFrkhKd3X4CpFGe4sMHB2kiPob5ToH8FtjYou7X](https://explorer.solana.com/address/GiCyZLFrkhKd3X4CpFGe4sMHB2kiPob5ToH8FtjYou7X?cluster=devnet)
- Platform custody wallet: [4sroL1aFi7iYZR2MWUMkZFacrnUkvrBG9EH7JtvSrzQm](https://explorer.solana.com/address/4sroL1aFi7iYZR2MWUMkZFacrnUkvrBG9EH7JtvSrzQm?cluster=devnet)
- Landlord wallet: [DyhutJsmAQVMdmYkSmE4QHVQjqD5zEpfpbci1pNwqbna](https://explorer.solana.com/address/DyhutJsmAQVMdmYkSmE4QHVQjqD5zEpfpbci1pNwqbna?cluster=devnet)

| Payment | Amount | Discount | On time (blockTime) | Explorer |
| --- | --- | --- | --- | --- |
| Deposit (tenant -> custody) | 400 tUSDC | 0% | true | [tx](https://explorer.solana.com/tx/55eFWkSFdfAgzrfXoWLkWoQJ184codb7YK32VxyM5bUEQ5uX9nj786Si6Dn713ASyMMSRpwytcquWLEZNAvaC2rf?cluster=devnet) |
| Rent, month 0 (tenant -> landlord) | 380 tUSDC | 5% | true | [tx](https://explorer.solana.com/tx/2w5SyNqwTjNDHj6TwqnDw29sW6nfiokTEiHZrmdahhCLBoR2oGMd69Ai4w8LTGPShYe4HeufpmDj4Lxmfq44RjnX?cluster=devnet) |

Memos (verified on chain: trailing hash equals the contract sha256):

- `lease:v1:demo-de2034a10738:deposit:360f288876e511122e530f9168b9a84e1afceb181b9ade7bbef8855e873ed69e`
- `lease:v1:demo-de2034a10738:rent:0:360f288876e511122e530f9168b9a84e1afceb181b9ade7bbef8855e873ed69e`

Recorded at blockTime 1791078939 (unix seconds).

## Historical: 2026-10-03 transactions with the legacy memo prefix

Sent before the working name changed. They use the prefix `tuki:lease:`, which `readMemoHash` still accepts.

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

## Solana Pay transaction request (QR flow), devnet

Produced by `scripts/solana-pay-e2e.ts`: the script plays the wallet (Ana's demo key signs the server-built tx), then the server confirms the payment through the unique reference. The platform wallet pays the fees.

| Payment | Amount | Discount | On time (blockTime) | Explorer |
| --- | --- | --- | --- | --- |
| Deposit (Solana Pay, tenant -> custody) | 420 tUSDC | 0% | true | [tx](https://explorer.solana.com/tx/5Em44eZDJiRS2ANSuFk4LcaceXxZsni455FyexgS7wDMqhdtytLWTTD9EnjgDMjbeG5HXUahau6ESQxvhCJSVcpf?cluster=devnet) |
| Rent, month 0 (Solana Pay, tenant -> landlord) | 399 tUSDC | 5% | true | [tx](https://explorer.solana.com/tx/3EYh8BvMQbQn1VEtrqHXQpbb8mKpi6pr3T39TWWjY4Wagzt1YUp69C9Qhy56vj8NME7XAVSzM2CjFYqpAaMpcXhQ?cluster=devnet) |

Memos: `lease:v1:ls_b03cca0a2c1019ec:deposit:1247ad7e0b8a92615429593dac424e22c4dff50e15d448728d8b6a82a9d03959` and `lease:v1:ls_b03cca0a2c1019ec:rent:0:1247ad7e0b8a92615429593dac424e22c4dff50e15d448728d8b6a82a9d03959`
