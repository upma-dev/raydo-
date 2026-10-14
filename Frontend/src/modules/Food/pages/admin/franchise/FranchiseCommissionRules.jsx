import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Percent } from "lucide-react";
import CommissionRuleEditor from "./finance/CommissionRuleEditor";
import { btn } from "./finance/ui";

/** Global default platform commission (used where neither the zone nor the franchise has its own rate). */
export default function FranchiseCommissionRules() {
  const navigate = useNavigate();
  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen text-slate-900 space-y-5 max-w-[1100px]">
      <button onClick={() => navigate("/admin/food/franchise-management")} className={btn.ghost}><ArrowLeft className="w-4 h-4" /> Franchise dashboard</button>
      <div>
        <h1 className="text-2xl font-black tracking-tight flex items-center gap-2"><Percent className="w-6 h-6 text-blue-600" /> Platform commission</h1>
        <p className="text-xs text-slate-500 mt-1">
          How much of each franchise's earnings the platform keeps. Priority: <b>franchise override</b> → <b>zone setting</b> (<Link className="text-blue-600 underline" to="/admin/food/franchise-management/territories">Zone pricing</Link>) → <b>global default</b> (this page).
        </p>
      </div>
      <CommissionRuleEditor scope="global" services={["food", "taxi"]} />
    </div>
  );
}
