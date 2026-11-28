# Requirements and grading

A working summary of the course project document. The document on SUCourse+ is the authority if anything here differs.

## Feature checklist

Weight is the feature's share of the demo presentation grade. Progress Demo features are marked; all features are expected at the Final Demo.

| Done | # | Requirement | Weight | Progress Demo |
| --- | --- | --- | --- | --- |
| [x] | 1 | Products shown in categories; users add them to a cart and purchase | | Yes |
| [x] | 2 | Store theme chosen by the team | | |
| [x] | 3 | Limited stock shown on product selection; stock decreases on purchase; order goes to delivery; order history shows processing, in-transit, delivered | 8% | Yes |
| [ ] | 4 | Browse and add to cart without login; login required to order, cart retained after login; mock bank confirmation; invoice on screen and emailed as PDF | 8% | Yes |
| [ ] | 5 | Comments and ratings only on delivered purchases; ratings publish directly, comments need product manager approval | 8% | Yes |
| [ ] | 6 | Attractive, easy-to-use, professional interface | 8% | |
| [x] | 7 | Search by name or description; sort by price or popularity; out-of-stock items stay searchable but cannot be added to the cart | 8% | Yes |
| [ ] | 8 | Browse and purchase through the website; admin interface for managerial tasks | 8% | |
| [x] | 9 | Product fields: ID, name, model, serial number, description, stock quantity, price, warranty status, distributor information | | Yes |
| [x] | 10 | Four roles: customer, sales manager, product manager, support agent | | |
| [ ] | 11 | Sales manager: set prices and discounts, notify wish-list users of discounts, view/print/save invoices by date range, revenue and profit/loss chart (cost defaults to 50% of sale price) | 8% | |
| [ ] | 12 | Product manager: manage products, categories and stock; delivery list (delivery ID, customer ID, product ID, quantity, total price, address, completed flag); update order status; approve or reject comments | 8% | |
| [ ] | 13 | Real-time support chat from any page for guests and logged-in users; file attachments (PDF, image, video); agent queue with claiming; agents see customer context when logged in | 13% | |
| [ ] | 14 | Customer actions: view, search, comment, rate, wish list, order, cancel (only while processing), return (only when delivered); customer fields: ID, name, tax ID, email, home address, password; profile page | 8% | |
| [x] | 15 | Credit card entry at purchase; verification and limits are out of scope | 2% | |
| [ ] | 16 | Selective returns within 30 days of purchase after delivery; sales manager approves after receiving the product; stock restored; customer notified; refund equals the discounted price actually paid | 8% | |
| [ ] | 17 | Security: roles kept separate; passwords, credit card data, invoices and user accounts hashed in storage | 2% | |
| [ ] | 18 | Stable operation and concurrent use by multiple users and roles | 3% | |

### Open items (28 November 2026)

Ticked rows work end to end on `dev` (site, API and database). The rest:

- **4:** the invoice PDF is generated, but email needs SMTP settings (Sprint 6, Kerem).
- **5:** ratings and comments work; the product manager's comment approval screen is missing (API done; Sprint 6, Can).
- **6:** judged at the demo.
- **8:** product, stock and delivery pages exist; sales manager pages are missing (Sprint 6, Emir).
- **11:** the discount column is in the database; discount, invoice-list and revenue APIs and pages are Sprint 6.
- **12:** products, stock, delivery list and order status work; comment approval screen missing.
- **13:** database tables are in; chat API and widget are Sprint 6 (Can).
- **14:** wish list and return request pages and the profile page are Sprint 6 (APIs: return requests done; wish list and profile update to do).
- **16:** customers can request selective returns through the API; sales manager approval, stock restore and notification are Sprint 6 (Kerem, Emir).
- **17:** roles are separated and tested, passwords use bcrypt, card numbers are kept only as the last four digits and an HMAC; invoices and accounts are not hashed beyond that.
- **18:** the last-card race is tested on PostgreSQL (`npm run test:concurrency`); no load test yet.

If the team uses Django, the admin interface must be custom. Using Django's built-in admin may earn no points for that feature.

## Schedule

Scrum meetings take place in the Friday lab (16:40–19:30, online). A new release is expected every two weeks.

| Week | Event |
| --- | --- |
| 4 | Sprint 1 Planning, Sprint 1 starts |
| 5 | Sprint 2 Planning |
| 6 | Sprint 1 Review & Retrospective, Sprint 2 starts |
| 7 | Sprint 3 Planning |
| 8 | Sprint 2 Review & Retrospective, Sprint 3 starts |
| 9 | Sprint 4 Planning |
| 10 | Sprint 3 Review & Retrospective, Sprint 4 starts |
| 11 | **Progress Demo** |
| 12 | Sprint 5 Planning |
| 13 | Sprint 4 Review & Retrospective, Sprint 5 starts |
| 14 | Sprint 5 Review & Retrospective |
| TBA | **Final Demo** |

Attendance at lab and Scrum meetings is compulsory.

## Grading

The project is 40% of the course grade, and a project score of at least 50 is required to pass. The Progress Demo counts for 40% of the project and the Final Demo for 60%. Grades are individual.

Each demo is graded as follows:

| Part | Share |
| --- | --- |
| Demo presentation (feature weights above) | 50% |
| Scrum meeting attendance and participation (0–2 per meeting) | 30% |
| Development activity | 20% |

Development activity is graded per demo:

| Minimum per demo | Share of development activity |
| --- | --- |
| 5 commits per member | 20% |
| 25 new unit test cases | 20% |
| 5 new bug reports | 20% |
| 30 sprint backlog items | 40% |

Quality and steady timing matter: padding the numbers or doing the work the night before a demo lowers the grade.
