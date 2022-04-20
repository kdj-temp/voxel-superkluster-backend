export enum ActivityType {
    Mint = "mint",
    List = "list",
    Offer = "offer",
    Transfer = "transfer",
    Cancel = "cancel",
    CancelAuction = "cancel_auction",
    Sale = "sale",
    Auction="auction",
    Bid="bid",
    CancelBid = "cancel_bid",
    CancelOffer = "cancel_offer"
}

export enum CurrencyType {
    ETH = "eth",
    WETH = "weth",
    VXL = "vxl"
}

export enum SaleType {
    Fixed = 1,
    Auction = 2,
    Default = 0
}

export enum BidMethod {
    Highest = 1,
    Declining = 2
}

export enum WarningType {
    Fake = 1,
    Sensitive = 2,
    Spam = 3,
    Other = 4   
}