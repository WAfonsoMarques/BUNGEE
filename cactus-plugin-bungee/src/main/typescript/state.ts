// import { Endorsement } from "./endorsement";
import { Transaction } from "./transaction";

export class State {
  private id: string;
  private version: number;
  private values: string[]; //set of state bins
  private transactions: Transaction[];

  constructor(id: string, stateBins: string[], transactions: Transaction[]) {
    this.id = id;
    this.version = stateBins.length;
    this.values = stateBins;
    this.transactions = transactions;
  }

  public getStateJson(): string {
    // eslint-disable-next-line prefer-const
    let txs: string[] = [];
    // eslint-disable-next-line prefer-const
    let txEndorsements: string[] = [];

    for (const tx of this.transactions) {
      txs.push(tx.getTxJson());
      txEndorsements.push(tx.getTxProofs());
    }

    const jsonSnap = {
      Id: this.id,
      Version: this.getVersion(),
      StateBins: this.values,
      Transactions: txs,
      Proofs: txEndorsements,
    };

    return JSON.stringify(jsonSnap);
  }

  //JUST FOR TESTING
  public getTimeForTxN(index: number): string {
    return this.transactions[index].getTimeStamp();
  }

  public getInitialTime(): string {
    if (this.transactions.length >= 1) {
      return this.transactions[0].getTimeStamp();
    }
    return "";
  }

  public getFinalTime(): string {
    if (this.transactions.length >= 1) {
      return this.transactions[this.transactions.length - 1].getTimeStamp();
    }
    return "";
  }

  // private getFinalTime(): string {
  //   if (this.finalTime == undefined) {
  //     return this.initialTime;
  //   }

  //   return this.finalTime;
  // }

  private getVersion(): string {
    return this.values.length.toString();
  }

  public pruneState(tI: string, tF: string): void {
    const tInum = parseInt(tI);
    const tFnum = parseInt(tF);
    // eslint-disable-next-line prefer-const
    this.transactions.forEach((element, index) => {
      if (
        parseInt(element.getTimeStamp()) < tInum ||
        parseInt(element.getTimeStamp()) > tFnum
      ) {
        this.transactions.splice(index, 1); //Remove tx
        this.values.splice(index, 1); //Remove state of tx
      }
    });
  }
}
