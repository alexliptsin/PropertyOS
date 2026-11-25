# PropertyOS

A local portfolio prototype for landlords managing whole-unit or rent-by-room properties in Canada and the United States.

Open `index.html` in a modern browser. For a stable local origin, run `python -m http.server 8080 --bind 127.0.0.1` from this folder and open `http://127.0.0.1:8080`.

The workspace starts with fictional records. Add or edit properties, units and rooms, tenants, leases, ledger entries, and maintenance requests. The dashboard calculates occupancy, current net ledger balances by currency, open requests, and upcoming lease ends. The compliance screen identifies Ontario properties for a future LTB workflow.

Leases can start with an annual fixed term or run month-to-month from the start. For annual leases, the checkbox **Continue month-to-month after the fixed term** defaults to checked for Ontario properties. It controls how PropertyOS tracks occupancy after the term. Enter a confirmed tenancy end when the tenancy actually ends. The fixed term date and existing ledger entries stay on the original lease record.

This prototype uses browser local storage. Use fictional data. It has no sign-in or shared database. Keep the same browser profile and origin to reopen saved records.

The planned production stack is Next.js, ASP.NET Core, PostgreSQL, and Azure. Production milestones include organization isolation, tenant access, document storage, rent receipt generation, payment processing, and jurisdiction-specific compliance workflows.

