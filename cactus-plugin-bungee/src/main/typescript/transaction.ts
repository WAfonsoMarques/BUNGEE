import { Endorsement } from "./endorsement";

export class Transaction {
  private id: string;
  private timeStamp: string;
  private endorsements: Endorsement[];

  constructor(id: string, timeStamp: string) {
    this.id = id;
    this.timeStamp = timeStamp;
    this.endorsements = [];
  }

  public printTransaction(): string {
    return "Transaction: \n " + this.id + " \n " + this.timeStamp;
  }

  public defineTxEndorsements(endorsements: Endorsement[]): void {
    this.endorsements = endorsements;
  }
  public getId(): string {
    return this.id;
  }

  public getTxJson(): string {
    const tx = { Id: this.id, TimeStamp: this.timeStamp };
    return JSON.stringify(tx);
  }

  public getTxEndorsements(): string {
    const txEndorsements = { Id: this.id, Endorsements: this.endorsements };
    return JSON.stringify(txEndorsements);
  }
}
