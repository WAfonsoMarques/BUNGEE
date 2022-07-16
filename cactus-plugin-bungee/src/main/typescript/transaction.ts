export class Transaction {
  private id: string;
  private timeStamp: string;

  constructor(id: string, timeStamp: string) {
    this.id = id;
    this.timeStamp = timeStamp;
  }

  public printTransaction(): string {
    return "Transaction: \n " + this.id + " \n " + this.timeStamp;
  }

  public getId(): string {
    return this.id;
  }
}
