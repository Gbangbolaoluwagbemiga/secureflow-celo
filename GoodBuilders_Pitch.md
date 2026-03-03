# GoodBuilders Season 3 Application - SecureFlow

This document contains the application draft and a detailed explanation of the proposed milestones for the GoodDollar Season 3 Builders Program.

---

## Part 1: Detailed Explanations of Milestones & Claim Flow

### 1. The Automated Fee-Routing Mechanism
**What it means:** Right now, when a freelancer completes a job, SecureFlow takes a small platform fee (controlled by your `platformFeeBP` variable in the smart contract). 
**The Plan:** Instead of SecureFlow keeping 100% of that fee, we will write a smart contract function that takes a percentage of those fees (when paid in G$) and donates them directly back into the massive GoodDollar UBI Pool. 
**Why it matters to the judges:** In their Notion document, one of the Exact Qualifying Integrations is: *"6. Contribute to the UBI Pool through activity-based fees"*. This proves to the judges that SecureFlow isn't just taking money out of their ecosystem; your app is actually helping sustain their UBI pool every time a successful gig is completed.

### 2. The "Verified Freelancer" Tier using G$ Identity SDK
**What it means:** In Web3 freelance platforms, clients are always worried about "Sybil attacks" (one person creating 50 fake freelancer profiles to spam job applications). 
**The Plan:** We will use GoodDollar's Identity SDK to verify that a freelancer is a real, unique human being (via their face-scan system). If they pass, they get a "Verified Freelancer" badge on SecureFlow. Clients can then filter jobs so only "Verified" humans can apply.
**Why it matters to the judges:** The judges specifically requested: *"3. Use the G$ Identity SDK in a meaningful way"*. This solves a massive trust issue in freelance platforms while forcing users to register with GoodDollar.

### When do users claim the G$ token, and who is eligible?
There are actually **three different ways** users will claim G$ on SecureFlow. This is your "Triple-Threat" advantage:

**1. The Daily UBI Claim (The Dashboard Button)**
*   **When:** Every single day.
*   **Who is eligible:** Anyone (clients or freelancers) who visits your dashboard and has completed the GoodDollar face verification.
*   **Why:** Because we added the `<claim-button>` to the Dashboard, users don't have to leave SecureFlow to get their daily free money. This drives daily active users (DAUs) to your site.

**2. The Escrow Payment Claim (The Job Payout)**
*   **When:** The exact moment the client clicks "Approve Milestone".
*   **Who is eligible:** The specific freelancer who successfully completed the work. The smart contract unlocks the G$ from escrow and sends it directly to their wallet.

**3. The Engagement Rewards Bonus (The Ecosystem Incentive)**
*   **When:** Also triggered the moment the client clicks "Approve Milestone". (Your `WorkLifecycle.sol` contract calls `engagementRewards.appClaim`).
*   **Who is eligible:** **Both** the Client and the Freelancer! GoodDollar's Engagement Rewards contract will actually send a bonus amount of G$ to *both* wallets just for using the Celo network and transacting in G$. 

---

## Part 2: Application Draft for Flow State

### 1. Admin

**Project Name***
SecureFlow

**Manager Addresses***
`0x3Be7fbBDbC73Fc4731D60EF09c4BA1A94DC58E41`
*(Keep the ones you already have in the screenshot)*

**Manager Emails***
`gbangbolaphilip@gmail.com`

**Default Funding Address***
`0x3Be7fbBDbC73Fc4731D60EF09c4BA1A94DC58E41`

---

### 2. Basics

**Description***

SecureFlow is a decentralized, trustless escrow platform designed to facilitate secure payments between freelancers and clients. Built on Celo, SecureFlow ensures that funds are securely locked in smart contracts and only released when verified milestones are met, providing complete financial security for both parties in the Web3 gig economy.

**Our Meaningful GoodDollar Integration:**
SecureFlow deeply integrates the GoodDollar ecosystem to unlock real utility and velocity for the G$ token in the freelance economy. We currently implement:

1. **G$ as a Payment Currency:** Clients can fund milestones and pay freelancers directly using the G$ token, giving it immediate real-world utility as a medium of exchange for services.
2. **Face-Verification & Claim Flow:** To ensure a sybil-resistant environment and reward active participants, we have directly integrated the `@goodsdks/ui-components` `<claim-button>`. Right from their SecureFlow dashboard, users are prompted to connect their GoodWallet and claim their daily UBI before or during their work.
3. **Engagement SDK Integration:** Our smart contracts are hooked into the Celo GoodDollar Engagement Rewards contract. Every time a client approves a milestone, the `appClaim` function is triggered, rewarding both the client and the freelancer for their economic activity on the platform.

**How we plan to grow during Season 3:**
Since our core integrations are already live, Season 3 for SecureFlow is entirely about growth, advanced functionality, and driving real adoption. Our roadmap for the season includes:
- **G$ Superfluid Streaming:** Transitioning from lump-sum milestone releases to by-the-second G$ streaming for freelancers as they work.
- **UBI Pool Contribution:** Implementing a protocol fee model where a percentage of completed G$ escrows is automatically routed back to the GoodDollar UBI Pool, creating a circular benefit.
- **Onboarding Freelancers:** Running targeted campaigns to onboard Web3 freelancers from emerging markets who benefit most from G$'s low-fee architecture and daily UBI claims.

**Website***
*(Enter your live website URL, e.g., https://secureflow.xyz)*

**Demo/Application Link***
*(Enter the link to the live dApp/dashboard so judges can see the Claim Button)*

---

### 3. Integration

**G$ Integration Status***
🔘 Live

**Integration Type***
☑️ Payments/rewards using G$
☑️ Claim flow
☑️ Other (Engagement Rewards SDK)

**Describe your G$ integration & why it matters (1-3 sentences)***
SecureFlow integrates GoodDollar as a primary payment currency for trustless freelance escrows and uses the `<claim-button>` to ensure users are active, verified citizens. Furthermore, our smart contracts are directly hooked into the Celo Engagement Rewards contract, ensuring both clients and freelancers are automatically rewarded for their economic activity and successful milestone completions in the gig economy.

---

### 4. What you'll build

**Primary Build Goal (1 sentence)***
Implement an automated fee-routing mechanism to send platform fees directly to the GoodDollar UBI Pool, and introduce a "Verified Freelancer" tier using the G$ Identity SDK.

**Build Milestone 1***
**Title***
Route Platform Fees to UBI Pool & Integrate Identity SDK
**Description***
Upgrade the SecureFlow smart contracts to automatically route a portion of the `platformFeeBP` (Platform Fee Base Points) from completed escrows back into the GoodDollar UBI Pool. Alongside this, we will implement the G$ Identity SDK on the frontend to replace our current manual verification flow, allowing only Sybil-resistant, verified freelancers to apply for high-value escrow jobs.
**Deliverable 1**
Deployed escrow contracts actively routing a percentage of fees to the UBI pool, and a frontend update where the "Verified" badge requires the G$ Identity SDK.

**Ecosystem Impact (1-2 sentences)**
This build directly contributes monetary value back to the GoodDollar UBI pool through activity-based fees generated by real-world gig work. Additionally, enforcing the Identity SDK for premium jobs ensures top-tier freelancers on our platform are unique, verified GoodDollar citizens.

---

### 5. How you'll grow

**Primary Growth Goal (1 sentence)***
Onboard 100 active Web3 freelancers and clients, generating at least $5,000 USD equivalent in Total Value Locked (TVL) and transaction volume across successfully completed G$ escrows.

**Target Users, Communities, and/or Partners***
Web3 freelancers from emerging markets (Africa, LatAm, Southeast Asia) and DAOs/Web3 startups needing trustless payout solutions.

**Growth Milestone 1***
**Title***
The "Secure Web3 Gig" Ecosystem Onboarding
**Description***
Launch a targeted campaign aimed at Web3 communities to use SecureFlow for their next freelance contract. We will leverage our existing network to bring in 50 active clients and 50 active freelancers, driving real G$ transaction volume through Escrow locks and milestone payments. **KPI:** 100 active wallet interactions, 50 completed escrows, and $5,000 equivalent G$ TVL processed.
**Activation 1**
Partner with 2-3 Web3 DAOs or developer communities to exclusively use SecureFlow for their bounty payouts over the 3-month period.

**Ecosystem Impact (1-2 sentences)**
This growth milestone drives significant utility, velocity, and transaction volume for the G$ token by giving it a highly practical use case: paying for real-world labor. It also brings net-new users from the gig economy into the GoodDollar ecosystem, where they will interact with the claim flow daily.

---

### 6. Team

**Primary Contact***
**Name**
*(Enter your name here)*

**Role & Description**
Lead Developer / Founder - responsible for the smart contract architecture and frontend integration of SecureFlow.

**Telegram**
*(Enter your Telegram link)*

**Github/LinkedIn Profile**
https://github.com/Gbangbolaoluwagbemiga

---

### 7. Additional

**Provide any additional context or comments**
We previously built SecureFlow's core mechanics and recently successfully integrated the GoodDollar `<claim-button>` onto our user dashboard as well as the Celo Engagement Rewards callback into our milestone lifecycle (`approveMilestone`). We are fundamentally shifting our focus towards adoption and growth in Season 3. Thank you!
