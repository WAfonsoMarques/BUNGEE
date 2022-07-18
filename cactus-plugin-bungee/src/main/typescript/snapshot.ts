// import { Endorsement } from "./endorsement";
import { Transaction } from "./transaction";

export class Snapshot {
  private id: string;
  private version: number;
  private stateBins: string[]; //set of state bins
  // private initialTime: string;
  // private finalTime?: string;
  private transactions: Transaction[];
  // private transactionsEndorsements: Map<string, Endorsement[]>;

  constructor(
    id: string,
    stateBins: string[],
    // initialTime: string,
    // finalTime: string,
    transactions: Transaction[],
    // transactionsEndorsements: Map<string, Endorsement[]>,
  ) {
    this.id = id;
    this.version = stateBins.length;
    this.stateBins = stateBins;
    // this.initialTime = initialTime;
    // this.finalTime = finalTime;
    this.transactions = transactions;
    // this.transactionsEndorsements = transactionsEndorsements;
  }

  // public getSnapshot(): string {
  //   return (
  //     "SNAPSHOT: \n " +
  //     this.id +
  //     " \n " +
  //     this.getVersion() +
  //     " \n " +
  //     // this.initialTime +
  //     // " \n " +
  //     // this.getFinalTime() +
  //     // " \n " +
  //     this.stateBins +
  //     " \n " +
  //     this.transactions.toString() +
  //     " \n " +
  //     this.transactionsEndorsements +
  //     " \n " +
  //     JSON.stringify(this.transactionsEndorsements)
  //   );
  // }

  public getSnapshotJson(): string {
    // eslint-disable-next-line prefer-const
    let txs: string[] = [];
    // eslint-disable-next-line prefer-const
    let txEndorsements: string[] = [];

    for (const tx of this.transactions) {
      txs.push(tx.getTxJson());
      txEndorsements.push(tx.getTxEndorsements());
    }

    const jsonSnap = {
      Id: this.id,
      Version: this.getVersion(),
      StateBins: this.stateBins,
      Transactions: txs,
      Endorsements: txEndorsements,
    };

    return JSON.stringify(jsonSnap);
  }

  // private getFinalTime(): string {
  //   if (this.finalTime == undefined) {
  //     return this.initialTime;
  //   }

  //   return this.finalTime;
  // }

  private getVersion(): string {
    return this.stateBins.length.toString();
  }
}
