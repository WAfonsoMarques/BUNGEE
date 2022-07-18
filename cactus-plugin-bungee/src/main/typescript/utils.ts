import { Transaction } from "./transaction";

export class Utils {
  static bufArray2HexStr(array: Uint8Array): string {
    return Buffer.from(array).toString("hex");
  }

  // Receive transactions in string format and parses to Transaction []
  static txsStringToTxs(txString: string): Transaction[] {
    // eslint-disable-next-line prefer-const
    let transactions: Transaction[] = [];

    const txs = JSON.parse(txString);

    for (const tx of txs) {
      const txId = tx.value.txId;
      // const ts = tx.value.timestamp.seconds + "." + tx.value.timestamp.nanos;
      const ts = tx.value.timestamp.seconds;
      transactions.push(new Transaction(txId, ts));
    }

    return transactions;
  }
}
