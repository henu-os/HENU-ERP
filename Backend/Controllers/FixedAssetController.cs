// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — FixedAssetController
// RESTful API for Fixed Asset Account Structure, Purchase Automation,
// SLM/WDV Depreciation Calculation & Single-Click Net Balance Engine
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using System.Text.RegularExpressions;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/fixed-assets")]
    [AllowAnonymous]
    public class FixedAssetController : ControllerBase
    {
        // ── Helper: Safe Data Extraction ─────────────────────────
        private static string GetStringSafe(NpgsqlDataReader r, string colName, string def = "")
        {
            try
            {
                int ord = r.GetOrdinal(colName);
                return r.IsDBNull(ord) ? def : (r.GetValue(ord)?.ToString()?.Trim() ?? def);
            }
            catch { return def; }
        }

        private static decimal GetDecimalSafe(NpgsqlDataReader r, string colName, decimal def = 0m)
        {
            try
            {
                int ord = r.GetOrdinal(colName);
                if (r.IsDBNull(ord)) return def;
                return Convert.ToDecimal(r.GetValue(ord));
            }
            catch { return def; }
        }

        private static int GetIntSafe(NpgsqlDataReader r, string colName, int def = 0)
        {
            try
            {
                int ord = r.GetOrdinal(colName);
                if (r.IsDBNull(ord)) return def;
                return Convert.ToInt32(r.GetValue(ord));
            }
            catch { return def; }
        }

        private static DateTime? GetDateSafe(NpgsqlDataReader r, string colName)
        {
            try
            {
                int ord = r.GetOrdinal(colName);
                if (r.IsDBNull(ord)) return null;
                return Convert.ToDateTime(r.GetValue(ord));
            }
            catch { return null; }
        }

        // ── GET /api/fixed-assets ────────────────────────────────
        // Returns all assets with dynamic live balances, additions, depreciation, and net balance
        [HttpGet]
        public IActionResult GetAll([FromQuery] int societyId, [FromQuery] int fyId = 0)
        {
            if (societyId <= 0)
                return BadRequest(new { success = false, message = "societyId is required." });

            try
            {
                using var conn = DbHelper.GetConn();

                // 1. Resolve Financial Year & Date Range
                DateTime fyStart = new DateTime(DateTime.Today.Year, 4, 1);
                DateTime fyEnd   = new DateTime(DateTime.Today.Year + 1, 3, 31);
                string fyLabel   = $"{DateTime.Today.Year}-{(DateTime.Today.Year + 1) % 100:D2}";

                using (var cmdFy = conn.CreateCommand())
                {
                    if (fyId > 0)
                    {
                        cmdFy.CommandText = "SELECT FYId, FYLabel, StartDate, EndDate FROM jeevika_erp.FinancialYear WHERE SocietyId = @sid AND FYId = @fyid LIMIT 1";
                        cmdFy.Parameters.AddWithValue("@fyid", fyId);
                    }
                    else
                    {
                        cmdFy.CommandText = "SELECT FYId, FYLabel, StartDate, EndDate FROM jeevika_erp.FinancialYear WHERE SocietyId = @sid AND IsActive = TRUE ORDER BY FYId DESC LIMIT 1";
                    }
                    cmdFy.Parameters.AddWithValue("@sid", societyId);
                    using var rFy = cmdFy.ExecuteReader();
                    if (rFy.Read())
                    {
                        fyId = Convert.ToInt32(rFy["FYId"]);
                        fyLabel = rFy["FYLabel"]?.ToString() ?? fyLabel;
                        if (rFy["StartDate"] != DBNull.Value) fyStart = Convert.ToDateTime(rFy["StartDate"]);
                        if (rFy["EndDate"] != DBNull.Value) fyEnd = Convert.ToDateTime(rFy["EndDate"]);
                    }
                }

                // 2. Fetch Assets for this society
                var assets = new List<Dictionary<string, object?>>();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
                        SELECT a.AssetId, a.SocietyId, a.AssetCode, a.AssetName, a.AssetCategory,
                               a.PurchaseDate, a.DepreciationMethod, a.DepreciationRate, a.HalfYearRate,
                               a.UsefulLifeYears, a.OpeningCost, a.OpeningDepreciation,
                               a.MainAccountId, a.AdditionsSubAccountId, a.DepreciationSubAccountId, a.AccumulatedDepAccountId,
                               a.Status, a.Remarks, a.CreatedAt,
                               m.AccCode AS MainAccCode, m.AccName AS MainAccName,
                               addAcc.AccCode AS AddAccCode, addAcc.AccName AS AddAccName,
                               depAcc.AccCode AS DepAccCode, depAcc.AccName AS DepAccName
                        FROM jeevika_erp.SocAsset a
                        LEFT JOIN jeevika_erp.SocAccount m ON a.MainAccountId = m.AccountId
                        LEFT JOIN jeevika_erp.SocAccount addAcc ON a.AdditionsSubAccountId = addAcc.AccountId
                        LEFT JOIN jeevika_erp.SocAccount depAcc ON a.DepreciationSubAccountId = depAcc.AccountId
                        WHERE a.SocietyId = @sid AND a.IsDeleted = FALSE
                        ORDER BY a.AssetCategory ASC, a.AssetCode ASC, a.AssetName ASC";
                    cmd.Parameters.AddWithValue("@sid", societyId);

                    using var r = cmd.ExecuteReader();
                    while (r.Read())
                    {
                        int assetId = GetIntSafe(r, "AssetId");
                        var item = new Dictionary<string, object?>
                        {
                            ["assetId"]                  = assetId,
                            ["societyId"]                = GetIntSafe(r, "SocietyId"),
                            ["assetCode"]                = GetStringSafe(r, "AssetCode"),
                            ["assetName"]                = GetStringSafe(r, "AssetName"),
                            ["assetCategory"]            = GetStringSafe(r, "AssetCategory"),
                            ["purchaseDate"]             = GetDateSafe(r, "PurchaseDate")?.ToString("yyyy-MM-dd"),
                            ["depreciationMethod"]       = GetStringSafe(r, "DepreciationMethod", "SLM").ToUpper(),
                            ["depreciationRate"]         = GetDecimalSafe(r, "DepreciationRate", 0m),
                            ["halfYearRate"]             = GetDecimalSafe(r, "HalfYearRate", 0m),
                            ["usefulLifeYears"]          = GetIntSafe(r, "UsefulLifeYears", 0),
                            ["openingCost"]              = GetDecimalSafe(r, "OpeningCost", 0m),
                            ["openingDepreciation"]      = GetDecimalSafe(r, "OpeningDepreciation", 0m),
                            ["mainAccountId"]            = r["MainAccountId"] == DBNull.Value ? (int?)null : Convert.ToInt32(r["MainAccountId"]),
                            ["mainAccCode"]              = GetStringSafe(r, "MainAccCode"),
                            ["mainAccName"]              = GetStringSafe(r, "MainAccName"),
                            ["additionsSubAccountId"]    = r["AdditionsSubAccountId"] == DBNull.Value ? (int?)null : Convert.ToInt32(r["AdditionsSubAccountId"]),
                            ["addAccCode"]               = GetStringSafe(r, "AddAccCode"),
                            ["addAccName"]               = GetStringSafe(r, "AddAccName"),
                            ["depreciationSubAccountId"] = r["DepreciationSubAccountId"] == DBNull.Value ? (int?)null : Convert.ToInt32(r["DepreciationSubAccountId"]),
                            ["depAccCode"]               = GetStringSafe(r, "DepAccCode"),
                            ["depAccName"]               = GetStringSafe(r, "DepAccName"),
                            ["status"]                   = GetStringSafe(r, "Status", "ACTIVE"),
                            ["remarks"]                  = GetStringSafe(r, "Remarks")
                        };
                        assets.Add(item);
                    }
                }

                // 3. Calculate Dynamic Additions, Depreciation, and Net Book Value per Asset
                decimal grandOpeningCost = 0;
                decimal grandOpeningDep = 0;
                decimal grandAdditions = 0;
                decimal grandDepreciation = 0;
                decimal grandNetBalance = 0;

                foreach (var a in assets)
                {
                    int assetId   = (int)a["assetId"]!;
                    int? mainAid  = (int?)a["mainAccountId"];
                    int? addAid   = (int?)a["additionsSubAccountId"];
                    int? depAid   = (int?)a["depreciationSubAccountId"];
                    decimal opCost = (decimal)a["openingCost"]!;
                    decimal opDep  = (decimal)a["openingDepreciation"]!;
                    decimal rate   = (decimal)a["depreciationRate"]!;
                    string method  = (string)a["depreciationMethod"]!;

                    // 3A. Fetch actual additions during FY from transactions / vouchers
                    decimal additions = 0;
                    var additionList = new List<(decimal Amount, DateTime Date)>();

                    var addTargets = new List<int>();
                    if (addAid.HasValue && addAid.Value > 0) addTargets.Add(addAid.Value);
                    if (mainAid.HasValue && mainAid.Value > 0) addTargets.Add(mainAid.Value);

                    if (addTargets.Count > 0)
                    {
                        using var cmdAdd = conn.CreateCommand();
                        var inTargets = string.Join(",", addTargets);
                        cmdAdd.CommandText = $@"
                            SELECT d.Debit, h.VoucherDate
                            FROM jeevika_erp.SocVoucherDetail d
                            JOIN jeevika_erp.SocVoucherHeader h ON d.VoucherId = h.VoucherId
                            WHERE h.SocietyId = @sid AND h.FYId = @fyid AND d.AccountId IN ({inTargets})
                              AND h.IsDeleted = FALSE AND d.Debit > 0 AND h.VoucherType NOT IN ('OPENING', 'OP')";
                        cmdAdd.Parameters.AddWithValue("@sid", societyId);
                        cmdAdd.Parameters.AddWithValue("@fyid", fyId);

                        using var rAdd = cmdAdd.ExecuteReader();
                        while (rAdd.Read())
                        {
                            decimal amt = Convert.ToDecimal(rAdd["Debit"]);
                            DateTime dt = Convert.ToDateTime(rAdd["VoucherDate"]);
                            additions += amt;
                            additionList.Add((amt, dt));
                        }
                    }

                    // 3B. Check if Depreciation was posted for this asset and period
                    decimal postedDep = 0;
                    bool isPosted = false;
                    string voucherNo = "";
                    int? voucherId = null;

                    using (var cmdDepLog = conn.CreateCommand())
                    {
                        cmdDepLog.CommandText = @"
                            SELECT LogId, DepreciationAmount, VoucherId, VoucherNo
                            FROM jeevika_erp.SocAssetDepreciationLog
                            WHERE SocietyId = @sid AND FYId = @fyid AND AssetId = @aid
                            ORDER BY LogId DESC LIMIT 1";
                        cmdDepLog.Parameters.AddWithValue("@sid", societyId);
                        cmdDepLog.Parameters.AddWithValue("@fyid", fyId);
                        cmdDepLog.Parameters.AddWithValue("@aid", assetId);

                        using var rDepLog = cmdDepLog.ExecuteReader();
                        if (rDepLog.Read())
                        {
                            postedDep = Convert.ToDecimal(rDepLog["DepreciationAmount"]);
                            voucherNo = rDepLog["VoucherNo"]?.ToString() ?? "";
                            if (rDepLog["VoucherId"] != DBNull.Value) voucherId = Convert.ToInt32(rDepLog["VoucherId"]);
                            isPosted = true;
                        }
                    }

                    // Also check actual credits on Depreciation Sub Account
                    if (depAid.HasValue && depAid.Value > 0)
                    {
                        using var cmdDepSub = conn.CreateCommand();
                        cmdDepSub.CommandText = @"
                            SELECT COALESCE(SUM(d.Credit), 0)
                            FROM jeevika_erp.SocVoucherDetail d
                            JOIN jeevika_erp.SocVoucherHeader h ON d.VoucherId = h.VoucherId
                            WHERE h.SocietyId = @sid AND h.FYId = @fyid AND d.AccountId = @aid
                              AND h.IsDeleted = FALSE";
                        cmdDepSub.Parameters.AddWithValue("@sid", societyId);
                        cmdDepSub.Parameters.AddWithValue("@fyid", fyId);
                        cmdDepSub.Parameters.AddWithValue("@aid", depAid.Value);
                        decimal subCredits = Convert.ToDecimal(cmdDepSub.ExecuteScalar() ?? 0);
                        if (subCredits > postedDep) postedDep = subCredits;
                    }

                    // 3C. Calculate Theoretical Depreciation for the year as per formula
                    // Opening Base:
                    decimal baseOpening = method == "WDV" ? Math.Max(0, opCost - opDep) : opCost;
                    decimal calcDepOpening = Math.Round(baseOpening * (rate / 100m), 2);

                    // Additions Base with 180-day rule (Before Sep 30 = 100% rate; Oct 1 or later = 50% rate)
                    decimal calcDepAdditions = 0;
                    DateTime sep30 = new DateTime(fyStart.Year, 9, 30);
                    foreach (var add in additionList)
                    {
                        decimal effectiveRate = add.Date <= sep30 ? rate : Math.Round(rate * 0.5m, 2);
                        calcDepAdditions += Math.Round(add.Amount * (effectiveRate / 100m), 2);
                    }

                    decimal totalCalculatedDep = calcDepOpening + calcDepAdditions;
                    decimal currentGross = opCost + additions;
                    decimal currentTotalDep = opDep + (isPosted ? postedDep : totalCalculatedDep);

                    // Net Book Value cannot be negative
                    decimal netBalance = Math.Max(0, currentGross - currentTotalDep);

                    a["additionsDuringYear"]    = additions;
                    a["depreciationDuringYear"] = isPosted ? postedDep : totalCalculatedDep;
                    a["calculatedDepreciation"] = totalCalculatedDep;
                    a["isDepreciationPosted"]   = isPosted;
                    a["depreciationVoucherNo"]  = voucherNo;
                    a["depreciationVoucherId"]  = voucherId;
                    a["totalGrossCost"]         = currentGross;
                    a["totalAccumulatedDep"]    = currentTotalDep;
                    a["netBookValue"]           = netBalance;

                    grandOpeningCost += opCost;
                    grandOpeningDep  += opDep;
                    grandAdditions   += additions;
                    grandDepreciation += (isPosted ? postedDep : totalCalculatedDep);
                    grandNetBalance  += netBalance;
                }

                return Ok(new
                {
                    success = true,
                    data = assets,
                    count = assets.Count,
                    financialYear = new { fyId, fyLabel, startDate = fyStart.ToString("yyyy-MM-dd"), endDate = fyEnd.ToString("yyyy-MM-dd") },
                    summary = new
                    {
                        totalAssets           = assets.Count,
                        totalOpeningCost      = grandOpeningCost,
                        totalOpeningDep       = grandOpeningDep,
                        totalOpeningWDV       = grandOpeningCost - grandOpeningDep,
                        totalAdditions        = grandAdditions,
                        totalDepreciation     = grandDepreciation,
                        totalNetBookValue     = grandNetBalance
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to load Fixed Assets: " + ex.Message });
            }
        }

        // ── GET /api/fixed-assets/{id} ───────────────────────────
        // Detailed asset record with its 3-tier ledger flow (Matching Section 7 of spec)
        [HttpGet("{id:int}")]
        public IActionResult GetById(int id, [FromQuery] int societyId, [FromQuery] int fyId = 0)
        {
            if (id <= 0 || societyId <= 0)
                return BadRequest(new { success = false, message = "Valid AssetId and SocietyId are required." });

            try
            {
                using var conn = DbHelper.GetConn();

                // 1. Fetch Asset Master
                Dictionary<string, object?>? asset = null;
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
                        SELECT a.*,
                               m.AccCode AS MainAccCode, m.AccName AS MainAccName,
                               addAcc.AccCode AS AddAccCode, addAcc.AccName AS AddAccName,
                               depAcc.AccCode AS DepAccCode, depAcc.AccName AS DepAccName
                        FROM jeevika_erp.SocAsset a
                        LEFT JOIN jeevika_erp.SocAccount m ON a.MainAccountId = m.AccountId
                        LEFT JOIN jeevika_erp.SocAccount addAcc ON a.AdditionsSubAccountId = addAcc.AccountId
                        LEFT JOIN jeevika_erp.SocAccount depAcc ON a.DepreciationSubAccountId = depAcc.AccountId
                        WHERE a.AssetId = @id AND a.SocietyId = @sid AND a.IsDeleted = FALSE
                        LIMIT 1";
                    cmd.Parameters.AddWithValue("@id", id);
                    cmd.Parameters.AddWithValue("@sid", societyId);

                    using var r = cmd.ExecuteReader();
                    if (!r.Read()) return NotFound(new { success = false, message = "Asset not found." });

                    asset = new Dictionary<string, object?>
                    {
                        ["assetId"]                  = GetIntSafe(r, "AssetId"),
                        ["societyId"]                = GetIntSafe(r, "SocietyId"),
                        ["assetCode"]                = GetStringSafe(r, "AssetCode"),
                        ["assetName"]                = GetStringSafe(r, "AssetName"),
                        ["assetCategory"]            = GetStringSafe(r, "AssetCategory"),
                        ["purchaseDate"]             = GetDateSafe(r, "PurchaseDate")?.ToString("yyyy-MM-dd"),
                        ["depreciationMethod"]       = GetStringSafe(r, "DepreciationMethod", "SLM").ToUpper(),
                        ["depreciationRate"]         = GetDecimalSafe(r, "DepreciationRate", 0m),
                        ["halfYearRate"]             = GetDecimalSafe(r, "HalfYearRate", 0m),
                        ["usefulLifeYears"]          = GetIntSafe(r, "UsefulLifeYears", 0),
                        ["openingCost"]              = GetDecimalSafe(r, "OpeningCost", 0m),
                        ["openingDepreciation"]      = GetDecimalSafe(r, "OpeningDepreciation", 0m),
                        ["mainAccountId"]            = r["MainAccountId"] == DBNull.Value ? (int?)null : Convert.ToInt32(r["MainAccountId"]),
                        ["mainAccCode"]              = GetStringSafe(r, "MainAccCode"),
                        ["mainAccName"]              = GetStringSafe(r, "MainAccName"),
                        ["additionsSubAccountId"]    = r["AdditionsSubAccountId"] == DBNull.Value ? (int?)null : Convert.ToInt32(r["AdditionsSubAccountId"]),
                        ["addAccCode"]               = GetStringSafe(r, "AddAccCode"),
                        ["addAccName"]               = GetStringSafe(r, "AddAccName"),
                        ["depreciationSubAccountId"] = r["DepreciationSubAccountId"] == DBNull.Value ? (int?)null : Convert.ToInt32(r["DepreciationSubAccountId"]),
                        ["depAccCode"]               = GetStringSafe(r, "DepAccCode"),
                        ["depAccName"]               = GetStringSafe(r, "DepAccName"),
                        ["status"]                   = GetStringSafe(r, "Status", "ACTIVE"),
                        ["remarks"]                  = GetStringSafe(r, "Remarks")
                    };
                }

                // 2. Fetch Ledger Entries for Main Account, Additions Sub-Account, Depreciation Sub-Account
                int? mainAid = (int?)asset["mainAccountId"];
                int? addAid  = (int?)asset["additionsSubAccountId"];
                int? depAid  = (int?)asset["depreciationSubAccountId"];

                var ledgerLines = new List<object>();
                var targetAids = new List<int>();
                if (mainAid.HasValue && mainAid.Value > 0) targetAids.Add(mainAid.Value);
                if (addAid.HasValue && addAid.Value > 0)   targetAids.Add(addAid.Value);
                if (depAid.HasValue && depAid.Value > 0)   targetAids.Add(depAid.Value);

                if (targetAids.Count > 0)
                {
                    using var cmdL = conn.CreateCommand();
                    var aidList = string.Join(",", targetAids);
                    cmdL.CommandText = $@"
                        SELECT h.VoucherId, h.VoucherNo, h.VoucherType, h.VoucherDate,
                               d.AccountId, d.AccountCode, d.AccountName, d.Debit, d.Credit,
                               COALESCE(d.Narration, h.Narration) AS Narration, h.PersonName
                        FROM jeevika_erp.SocVoucherDetail d
                        JOIN jeevika_erp.SocVoucherHeader h ON d.VoucherId = h.VoucherId
                        WHERE h.SocietyId = @sid AND d.AccountId IN ({aidList}) AND h.IsDeleted = FALSE
                        ORDER BY h.VoucherDate ASC, h.VoucherId ASC";
                    cmdL.Parameters.AddWithValue("@sid", societyId);

                    using var rL = cmdL.ExecuteReader();
                    while (rL.Read())
                    {
                        ledgerLines.Add(new
                        {
                            voucherId   = Convert.ToInt32(rL["VoucherId"]),
                            voucherNo   = rL["VoucherNo"]?.ToString() ?? "",
                            voucherType = rL["VoucherType"]?.ToString() ?? "",
                            voucherDate = ((DateTime)rL["VoucherDate"]).ToString("yyyy-MM-dd"),
                            accountId   = Convert.ToInt32(rL["AccountId"]),
                            accountCode = rL["AccountCode"]?.ToString() ?? "",
                            accountName = rL["AccountName"]?.ToString() ?? "",
                            debit       = Convert.ToDecimal(rL["Debit"]),
                            credit      = Convert.ToDecimal(rL["Credit"]),
                            narration   = rL["Narration"]?.ToString() ?? "",
                            personName  = rL["PersonName"]?.ToString() ?? ""
                        });
                    }
                }

                asset["ledgerTransactions"] = ledgerLines;
                return Ok(new { success = true, data = asset });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to fetch asset: " + ex.Message });
            }
        }

        // ── POST /api/fixed-assets ───────────────────────────────
        // Creates Asset Master and automatically provisions the 3-Tier Account Structure
        [HttpPost]
        public IActionResult Create([FromBody] AssetCreateModel model)
        {
            if (model.SocietyId <= 0)
                return BadRequest(new { success = false, message = "SocietyId is required." });
            if (string.IsNullOrWhiteSpace(model.AssetName))
                return BadRequest(new { success = false, message = "Asset Name is required." });
            if (string.IsNullOrWhiteSpace(model.AssetCategory))
                model.AssetCategory = "Computer & Equipment";

            try
            {
                using var conn = DbHelper.GetConn();
                using var tx   = conn.BeginTransaction();

                // 1. Resolve or Generate Asset Code
                string assetCode = model.AssetCode?.Trim().ToUpper() ?? "";
                if (string.IsNullOrWhiteSpace(assetCode))
                {
                    using var cmdCode = conn.CreateCommand();
                    cmdCode.Transaction = tx;
                    cmdCode.CommandText = @"
                        SELECT AssetCode FROM jeevika_erp.SocAsset
                        WHERE SocietyId = @sid AND IsDeleted = FALSE";
                    cmdCode.Parameters.AddWithValue("@sid", model.SocietyId);
                    int maxNum = 0;
                    using (var rCode = cmdCode.ExecuteReader())
                    {
                        while (rCode.Read())
                        {
                            var c = rCode["AssetCode"]?.ToString() ?? "";
                            var m = Regex.Match(c, @"(\d+)$");
                            if (m.Success && int.TryParse(m.Groups[1].Value, out int num) && num > maxNum)
                                maxNum = num;
                        }
                    }
                    assetCode = $"FA-{(maxNum + 1):D3}";
                }

                // 2. Locate or Ensure 'Fixed Assets' Group in SocGroup
                int fixedAssetGroupId = 0;
                using (var cmdGrp = conn.CreateCommand())
                {
                    cmdGrp.Transaction = tx;
                    cmdGrp.CommandText = @"
                        SELECT GroupId FROM jeevika_erp.SocGroup
                        WHERE SocietyId = @sid AND GrpMainId = 1 AND (GrpName ILIKE '%Fixed Asset%' OR GrpCode = 'AS-06')
                          AND IsDeleted = FALSE LIMIT 1";
                    cmdGrp.Parameters.AddWithValue("@sid", model.SocietyId);
                    var gObj = cmdGrp.ExecuteScalar();
                    if (gObj != null && gObj != DBNull.Value)
                    {
                        fixedAssetGroupId = Convert.ToInt32(gObj);
                    }
                    else
                    {
                        // Fallback: Pick any asset group
                        cmdGrp.CommandText = "SELECT GroupId FROM jeevika_erp.SocGroup WHERE SocietyId = @sid AND GrpMainId = 1 AND IsDeleted = FALSE LIMIT 1";
                        var fObj = cmdGrp.ExecuteScalar();
                        if (fObj != null && fObj != DBNull.Value) fixedAssetGroupId = Convert.ToInt32(fObj);
                    }
                }

                // 3. Automated 3-Tier Account Provisioning
                int mainAccId = model.MainAccountId ?? 0;
                int addAccId  = model.AdditionsSubAccountId ?? 0;
                int depAccId  = model.DepreciationSubAccountId ?? 0;

                // 3A. Main Asset Account (e.g. 'Computer System')
                if (mainAccId <= 0)
                {
                    using var cmdAccCode = conn.CreateCommand();
                    cmdAccCode.Transaction = tx;
                    cmdAccCode.CommandText = "SELECT MAX(AccountId) FROM jeevika_erp.SocAccount WHERE SocietyId = @sid";
                    cmdAccCode.Parameters.AddWithValue("@sid", model.SocietyId);
                    int nextSeq = Convert.ToInt32(cmdAccCode.ExecuteScalar() ?? 1020) + 1;
                    string mainCode = $"ASS-{nextSeq:D4}";

                    using var cmdMain = conn.CreateCommand();
                    cmdMain.Transaction = tx;
                    cmdMain.CommandText = @"
                        INSERT INTO jeevika_erp.SocAccount
                            (SocietyId, AccCode, AccName, AccBSName, GroupId, GrpMainId,
                             OpBal, OpDrCr, DepAnnual, DepHalf, AccountSubType, IsDefault)
                        VALUES
                            (@sid, @code, @name, @bsname, @gid, 1,
                             @opbal, 'Dr', @depAnn, @depHalf, 'MAIN_ASSET', FALSE)
                        RETURNING AccountId";
                    cmdMain.Parameters.AddWithValue("@sid", model.SocietyId);
                    cmdMain.Parameters.AddWithValue("@code", mainCode);
                    cmdMain.Parameters.AddWithValue("@name", model.AssetName.Trim());
                    cmdMain.Parameters.AddWithValue("@bsname", model.AssetName.Trim());
                    cmdMain.Parameters.AddWithValue("@gid", fixedAssetGroupId > 0 ? (object)fixedAssetGroupId : DBNull.Value);
                    cmdMain.Parameters.AddWithValue("@opbal", model.OpeningCost);
                    cmdMain.Parameters.AddWithValue("@depAnn", model.DepreciationRate);
                    cmdMain.Parameters.AddWithValue("@depHalf", model.HalfYearRate > 0 ? model.HalfYearRate : Math.Round(model.DepreciationRate * 0.5m, 2));

                    mainAccId = Convert.ToInt32(cmdMain.ExecuteScalar());
                }

                // 3B. Sub-Account 1: Additions During Year
                if (addAccId <= 0 && mainAccId > 0)
                {
                    string addCode = $"ASS-{mainAccId}-ADD";
                    string addName = $"{model.AssetName.Trim()} - Additions During Year";

                    using var cmdAdd = conn.CreateCommand();
                    cmdAdd.Transaction = tx;
                    cmdAdd.CommandText = @"
                        INSERT INTO jeevika_erp.SocAccount
                            (SocietyId, AccCode, AccName, AccBSName, GroupId, GrpMainId,
                             OpBal, OpDrCr, ParentAccountId, AccountSubType, IsDefault)
                        VALUES
                            (@sid, @code, @name, @name, @gid, 1,
                             0, 'Dr', @parentId, 'ASSET_ADDITIONS', FALSE)
                        RETURNING AccountId";
                    cmdAdd.Parameters.AddWithValue("@sid", model.SocietyId);
                    cmdAdd.Parameters.AddWithValue("@code", addCode);
                    cmdAdd.Parameters.AddWithValue("@name", addName);
                    cmdAdd.Parameters.AddWithValue("@gid", fixedAssetGroupId > 0 ? (object)fixedAssetGroupId : DBNull.Value);
                    cmdAdd.Parameters.AddWithValue("@parentId", mainAccId);

                    addAccId = Convert.ToInt32(cmdAdd.ExecuteScalar());
                }

                // 3C. Sub-Account 2: Depreciation During Year
                if (depAccId <= 0 && mainAccId > 0)
                {
                    string depCode = $"ASS-{mainAccId}-DEP";
                    string depName = $"{model.AssetName.Trim()} - Depreciation During Year";

                    using var cmdDep = conn.CreateCommand();
                    cmdDep.Transaction = tx;
                    cmdDep.CommandText = @"
                        INSERT INTO jeevika_erp.SocAccount
                            (SocietyId, AccCode, AccName, AccBSName, GroupId, GrpMainId,
                             OpBal, OpDrCr, ParentAccountId, AccountSubType, IsDefault)
                        VALUES
                            (@sid, @code, @name, @name, @gid, 1,
                             0, 'Cr', @parentId, 'ASSET_DEPRECIATION', FALSE)
                        RETURNING AccountId";
                    cmdDep.Parameters.AddWithValue("@sid", model.SocietyId);
                    cmdDep.Parameters.AddWithValue("@code", depCode);
                    cmdDep.Parameters.AddWithValue("@name", depName);
                    cmdDep.Parameters.AddWithValue("@gid", fixedAssetGroupId > 0 ? (object)fixedAssetGroupId : DBNull.Value);
                    cmdDep.Parameters.AddWithValue("@parentId", mainAccId);

                    depAccId = Convert.ToInt32(cmdDep.ExecuteScalar());
                }

                // 4. Insert into SocAsset
                int newAssetId = 0;
                using (var cmdIns = conn.CreateCommand())
                {
                    cmdIns.Transaction = tx;
                    cmdIns.CommandText = @"
                        INSERT INTO jeevika_erp.SocAsset
                            (SocietyId, AssetCode, AssetName, AssetCategory, PurchaseDate,
                             DepreciationMethod, DepreciationRate, HalfYearRate, UsefulLifeYears,
                             OpeningCost, OpeningDepreciation, MainAccountId, AdditionsSubAccountId, DepreciationSubAccountId,
                             Status, Remarks)
                        VALUES
                            (@sid, @code, @name, @cat, @pdate,
                             @method, @rate, @hrate, @life,
                             @opcost, @opdep, @mainAid, @addAid, @depAid,
                             'ACTIVE', @remarks)
                        RETURNING AssetId";
                    cmdIns.Parameters.AddWithValue("@sid", model.SocietyId);
                    cmdIns.Parameters.AddWithValue("@code", assetCode);
                    cmdIns.Parameters.AddWithValue("@name", model.AssetName.Trim());
                    cmdIns.Parameters.AddWithValue("@cat", model.AssetCategory.Trim());
                    cmdIns.Parameters.AddWithValue("@pdate", model.PurchaseDate.HasValue ? (object)model.PurchaseDate.Value : DBNull.Value);
                    cmdIns.Parameters.AddWithValue("@method", string.IsNullOrWhiteSpace(model.DepreciationMethod) ? "SLM" : model.DepreciationMethod.Trim().ToUpper());
                    cmdIns.Parameters.AddWithValue("@rate", model.DepreciationRate);
                    cmdIns.Parameters.AddWithValue("@hrate", model.HalfYearRate > 0 ? model.HalfYearRate : Math.Round(model.DepreciationRate * 0.5m, 2));
                    cmdIns.Parameters.AddWithValue("@life", model.UsefulLifeYears);
                    cmdIns.Parameters.AddWithValue("@opcost", model.OpeningCost);
                    cmdIns.Parameters.AddWithValue("@opdep", model.OpeningDepreciation);
                    cmdIns.Parameters.AddWithValue("@mainAid", mainAccId > 0 ? (object)mainAccId : DBNull.Value);
                    cmdIns.Parameters.AddWithValue("@addAid", addAccId > 0 ? (object)addAccId : DBNull.Value);
                    cmdIns.Parameters.AddWithValue("@depAid", depAccId > 0 ? (object)depAccId : DBNull.Value);
                    cmdIns.Parameters.AddWithValue("@remarks", (object?)model.Remarks ?? DBNull.Value);

                    newAssetId = Convert.ToInt32(cmdIns.ExecuteScalar());
                }

                // 5. Back-link AssetId to the newly created accounts
                using (var cmdLink = conn.CreateCommand())
                {
                    cmdLink.Transaction = tx;
                    cmdLink.CommandText = @"
                        UPDATE jeevika_erp.SocAccount
                        SET AssetId = @assetId
                        WHERE AccountId IN (@mainAid, @addAid, @depAid)";
                    cmdLink.Parameters.AddWithValue("@assetId", newAssetId);
                    cmdLink.Parameters.AddWithValue("@mainAid", mainAccId);
                    cmdLink.Parameters.AddWithValue("@addAid", addAccId);
                    cmdLink.Parameters.AddWithValue("@depAid", depAccId);
                    cmdLink.ExecuteNonQuery();
                }

                tx.Commit();

                return Ok(new
                {
                    success = true,
                    message = "Fixed Asset created with automated 3-tier sub accounts successfully.",
                    assetId = newAssetId,
                    assetCode = assetCode,
                    accounts = new
                    {
                        mainAccountId = mainAccId,
                        additionsSubAccountId = addAccId,
                        depreciationSubAccountId = depAccId
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to create asset: " + ex.Message });
            }
        }

        // ── PUT /api/fixed-assets/{id} ───────────────────────────
        [HttpPut("{id:int}")]
        public IActionResult Update(int id, [FromBody] AssetCreateModel model)
        {
            if (id <= 0 || model.SocietyId <= 0)
                return BadRequest(new { success = false, message = "Valid AssetId and SocietyId are required." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    UPDATE jeevika_erp.SocAsset
                    SET AssetName = @name,
                        AssetCategory = @cat,
                        PurchaseDate = @pdate,
                        DepreciationMethod = @method,
                        DepreciationRate = @rate,
                        HalfYearRate = @hrate,
                        UsefulLifeYears = @life,
                        OpeningCost = @opcost,
                        OpeningDepreciation = @opdep,
                        Remarks = @remarks,
                        UpdatedAt = NOW()
                    WHERE AssetId = @id AND SocietyId = @sid AND IsDeleted = FALSE";
                cmd.Parameters.AddWithValue("@id", id);
                cmd.Parameters.AddWithValue("@sid", model.SocietyId);
                cmd.Parameters.AddWithValue("@name", model.AssetName.Trim());
                cmd.Parameters.AddWithValue("@cat", model.AssetCategory.Trim());
                cmd.Parameters.AddWithValue("@pdate", model.PurchaseDate.HasValue ? (object)model.PurchaseDate.Value : DBNull.Value);
                cmd.Parameters.AddWithValue("@method", string.IsNullOrWhiteSpace(model.DepreciationMethod) ? "SLM" : model.DepreciationMethod.Trim().ToUpper());
                cmd.Parameters.AddWithValue("@rate", model.DepreciationRate);
                cmd.Parameters.AddWithValue("@hrate", model.HalfYearRate > 0 ? model.HalfYearRate : Math.Round(model.DepreciationRate * 0.5m, 2));
                cmd.Parameters.AddWithValue("@life", model.UsefulLifeYears);
                cmd.Parameters.AddWithValue("@opcost", model.OpeningCost);
                cmd.Parameters.AddWithValue("@opdep", model.OpeningDepreciation);
                cmd.Parameters.AddWithValue("@remarks", (object?)model.Remarks ?? DBNull.Value);

                int affected = cmd.ExecuteNonQuery();
                if (affected == 0) return NotFound(new { success = false, message = "Asset not found or already deleted." });

                return Ok(new { success = true, message = "Asset updated successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to update asset: " + ex.Message });
            }
        }

        // ── DELETE /api/fixed-assets/{id} ────────────────────────
        [HttpDelete("{id:int}")]
        public IActionResult Delete(int id, [FromQuery] int societyId)
        {
            if (id <= 0 || societyId <= 0)
                return BadRequest(new { success = false, message = "Valid AssetId and SocietyId are required." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = "UPDATE jeevika_erp.SocAsset SET IsDeleted = TRUE, UpdatedAt = NOW() WHERE AssetId = @id AND SocietyId = @sid";
                cmd.Parameters.AddWithValue("@id", id);
                cmd.Parameters.AddWithValue("@sid", societyId);

                int rows = cmd.ExecuteNonQuery();
                return Ok(new { success = true, message = "Asset deleted successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to delete asset: " + ex.Message });
            }
        }

        // ── POST /api/fixed-assets/calculate-depreciation ────────
        // Simulates & calculates depreciation for all assets without posting
        [HttpPost("calculate-depreciation")]
        public IActionResult CalculateDepreciation([FromBody] DepreciationCalculationRequest req)
        {
            if (req.SocietyId <= 0)
                return BadRequest(new { success = false, message = "SocietyId is required." });

            try
            {
                var calcResults = ComputeDepreciationBatch(req.SocietyId, req.FYId, req.PeriodTo);
                return Ok(new { success = true, data = calcResults.Results, summary = calcResults.Summary });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Depreciation calculation failed: " + ex.Message });
            }
        }

        // ── POST /api/fixed-assets/post-depreciation ─────────────
        // Generates and posts the automated Accounting JV into SocVoucherHeader & SocVoucherDetail
        [HttpPost("post-depreciation")]
        public IActionResult PostDepreciation([FromBody] DepreciationPostRequest req)
        {
            if (req.SocietyId <= 0)
                return BadRequest(new { success = false, message = "SocietyId is required." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var tx   = conn.BeginTransaction();

                // 1. Resolve Financial Year & Date
                int resolvedFyId = req.FYId;
                string fyLabel   = "";
                DateTime fyEnd   = DateTime.Today;

                using (var cmdFy = conn.CreateCommand())
                {
                    cmdFy.Transaction = tx;
                    if (resolvedFyId > 0)
                    {
                        cmdFy.CommandText = "SELECT FYId, FYLabel, EndDate FROM jeevika_erp.FinancialYear WHERE SocietyId = @sid AND FYId = @fyid LIMIT 1";
                        cmdFy.Parameters.AddWithValue("@fyid", resolvedFyId);
                    }
                    else
                    {
                        cmdFy.CommandText = "SELECT FYId, FYLabel, EndDate FROM jeevika_erp.FinancialYear WHERE SocietyId = @sid AND IsActive = TRUE ORDER BY FYId DESC LIMIT 1";
                    }
                    cmdFy.Parameters.AddWithValue("@sid", req.SocietyId);
                    using var rFy = cmdFy.ExecuteReader();
                    if (rFy.Read())
                    {
                        resolvedFyId = Convert.ToInt32(rFy["FYId"]);
                        fyLabel      = rFy["FYLabel"]?.ToString() ?? "";
                        if (rFy["EndDate"] != DBNull.Value) fyEnd = Convert.ToDateTime(rFy["EndDate"]);
                    }
                }

                if (req.VoucherDate.HasValue) fyEnd = req.VoucherDate.Value;

                // 2. Prevent duplicate depreciation posting unless overwrite is explicitly requested
                if (!req.Overwrite)
                {
                    using var checkCmd = conn.CreateCommand();
                    checkCmd.Transaction = tx;
                    checkCmd.CommandText = @"
                        SELECT COUNT(*) FROM jeevika_erp.SocAssetDepreciationLog
                        WHERE SocietyId = @sid AND FYId = @fyid";
                    checkCmd.Parameters.AddWithValue("@sid", req.SocietyId);
                    checkCmd.Parameters.AddWithValue("@fyid", resolvedFyId);
                    long existingCount = Convert.ToInt64(checkCmd.ExecuteScalar() ?? 0);
                    if (existingCount > 0)
                    {
                        return Conflict(new
                        {
                            success = false,
                            isDuplicate = true,
                            message = $"Depreciation for FY {fyLabel} has already been posted ({existingCount} assets). Check 'Overwrite' if you want to recalculate and replace existing entries."
                        });
                    }
                }
                else
                {
                    // Clean up prior depreciation log and linked journal vouchers if overwriting
                    using var cleanCmd = conn.CreateCommand();
                    cleanCmd.Transaction = tx;
                    cleanCmd.CommandText = @"
                        UPDATE jeevika_erp.SocVoucherHeader
                        SET IsDeleted = TRUE, UpdatedAt = NOW()
                        WHERE VoucherId IN (
                            SELECT VoucherId FROM jeevika_erp.SocAssetDepreciationLog
                            WHERE SocietyId = @sid AND FYId = @fyid AND VoucherId IS NOT NULL
                        );
                        DELETE FROM jeevika_erp.SocAssetDepreciationLog
                        WHERE SocietyId = @sid AND FYId = @fyid;";
                    cleanCmd.Parameters.AddWithValue("@sid", req.SocietyId);
                    cleanCmd.Parameters.AddWithValue("@fyid", resolvedFyId);
                    cleanCmd.ExecuteNonQuery();
                }

                // 3. Compute live depreciation
                var batch = ComputeDepreciationBatch(req.SocietyId, resolvedFyId, fyEnd, conn, tx);
                if (batch.Results.Count == 0 || batch.Summary.TotalDepreciation <= 0)
                {
                    return BadRequest(new { success = false, message = "No assets with positive depreciation found to post." });
                }

                // 4. Locate Depreciation Expense Account (EXP-1028 or Expense group)
                int depExpenseAccId = 0;
                string depExpenseCode = "EXP-1028";
                string depExpenseName = "Depreciation Exp.";

                using (var cmdExp = conn.CreateCommand())
                {
                    cmdExp.Transaction = tx;
                    cmdExp.CommandText = @"
                        SELECT AccountId, AccCode, AccName FROM jeevika_erp.SocAccount
                        WHERE SocietyId = @sid AND (AccCode = 'EXP-1028' OR (GrpMainId = 4 AND AccName ILIKE '%Depreciation%'))
                          AND IsDeleted = FALSE LIMIT 1";
                    cmdExp.Parameters.AddWithValue("@sid", req.SocietyId);
                    using var rExp = cmdExp.ExecuteReader();
                    if (rExp.Read())
                    {
                        depExpenseAccId = Convert.ToInt32(rExp["AccountId"]);
                        depExpenseCode  = rExp["AccCode"]?.ToString() ?? depExpenseCode;
                        depExpenseName  = rExp["AccName"]?.ToString() ?? depExpenseName;
                    }
                }

                // Fallback: create Depreciation Expense account if missing
                if (depExpenseAccId <= 0)
                {
                    using var cmdCreateExp = conn.CreateCommand();
                    cmdCreateExp.Transaction = tx;
                    cmdCreateExp.CommandText = @"
                        INSERT INTO jeevika_erp.SocAccount
                            (SocietyId, AccCode, AccName, AccBSName, GrpMainId, OpBal, OpDrCr, IsDefault)
                        VALUES
                            (@sid, 'EXP-1028', 'Depreciation', 'Depreciation', 4, 0, 'Dr', TRUE)
                        RETURNING AccountId";
                    cmdCreateExp.Parameters.AddWithValue("@sid", req.SocietyId);
                    depExpenseAccId = Convert.ToInt32(cmdCreateExp.ExecuteScalar());
                }

                // 5. Generate Voucher Number (e.g. JV/2026-27/01)
                string vPrefix = "JV";
                string pfxLike = $"{vPrefix}/{fyLabel}/%";
                int maxSeq = 0;

                using (var cmdVNo = conn.CreateCommand())
                {
                    cmdVNo.Transaction = tx;
                    cmdVNo.CommandText = @"
                        SELECT VoucherNo FROM jeevika_erp.SocVoucherHeader
                        WHERE SocietyId = @sid AND FYId = @fyid AND VoucherNo LIKE @pfxLike";
                    cmdVNo.Parameters.AddWithValue("@sid", req.SocietyId);
                    cmdVNo.Parameters.AddWithValue("@fyid", resolvedFyId);
                    cmdVNo.Parameters.AddWithValue("@pfxLike", pfxLike);
                    using var rVNo = cmdVNo.ExecuteReader();
                    while (rVNo.Read())
                    {
                        var s = rVNo["VoucherNo"]?.ToString() ?? "";
                        var m = Regex.Match(s, @"(\d+)$");
                        if (m.Success && int.TryParse(m.Groups[1].Value, out int num) && num > maxSeq)
                            maxSeq = num;
                    }
                }

                string voucherNo = $"{vPrefix}/{fyLabel}/{(maxSeq + 1):D2}";

                // 6. Create SocVoucherHeader
                int voucherId = 0;
                using (var cmdH = conn.CreateCommand())
                {
                    cmdH.Transaction = tx;
                    cmdH.CommandText = @"
                        INSERT INTO jeevika_erp.SocVoucherHeader
                            (SocietyId, FYId, VoucherNo, VoucherType, VoucherDate, Amount,
                             Narration, Particular1, Status, CreatedBy)
                        VALUES
                            (@sid, @fyid, @vno, 'JOURNAL', @vdate, @amt,
                             @narration, 'Fixed Asset Depreciation', 'Posted', 'AUTO_DEP_ENGINE')
                        RETURNING VoucherId";
                    cmdH.Parameters.AddWithValue("@sid", req.SocietyId);
                    cmdH.Parameters.AddWithValue("@fyid", resolvedFyId);
                    cmdH.Parameters.AddWithValue("@vno", voucherNo);
                    cmdH.Parameters.AddWithValue("@vdate", fyEnd);
                    cmdH.Parameters.AddWithValue("@amt", batch.Summary.TotalDepreciation);
                    cmdH.Parameters.AddWithValue("@narration", $"Automated Depreciation entry for FY {fyLabel} across {batch.Results.Count} fixed assets.");

                    voucherId = Convert.ToInt32(cmdH.ExecuteScalar());
                }

                // 7. Create SocVoucherDetail (Debit = Expense, Credit = Asset Sub Accounts)
                int srNo = 1;

                // 7A. Debit Leg: Total Depreciation Expense
                using (var cmdDr = conn.CreateCommand())
                {
                    cmdDr.Transaction = tx;
                    cmdDr.CommandText = @"
                        INSERT INTO jeevika_erp.SocVoucherDetail
                            (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                        VALUES
                            (@vid, @sr, @aid, @code, @name, @dr, 0, @narr)";
                    cmdDr.Parameters.AddWithValue("@vid", voucherId);
                    cmdDr.Parameters.AddWithValue("@sr", srNo++);
                    cmdDr.Parameters.AddWithValue("@aid", depExpenseAccId);
                    cmdDr.Parameters.AddWithValue("@code", depExpenseCode);
                    cmdDr.Parameters.AddWithValue("@name", depExpenseName);
                    cmdDr.Parameters.AddWithValue("@dr", batch.Summary.TotalDepreciation);
                    cmdDr.Parameters.AddWithValue("@narr", $"Depreciation expense for FY {fyLabel}");
                    cmdDr.ExecuteNonQuery();
                }

                // 7B. Credit Legs: Individual Asset Depreciation Sub-Accounts
                foreach (var item in batch.Results)
                {
                    if (item.DepreciationAmount <= 0) continue;

                    int creditAccId = item.DepreciationSubAccountId > 0 ? item.DepreciationSubAccountId : item.MainAccountId;
                    string creditCode = !string.IsNullOrEmpty(item.DepAccCode) ? item.DepAccCode : item.MainAccCode;
                    string creditName = !string.IsNullOrEmpty(item.DepAccName) ? item.DepAccName : item.MainAccName;

                    using (var cmdCr = conn.CreateCommand())
                    {
                        cmdCr.Transaction = tx;
                        cmdCr.CommandText = @"
                            INSERT INTO jeevika_erp.SocVoucherDetail
                                (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                            VALUES
                                (@vid, @sr, @aid, @code, @name, 0, @cr, @narr)";
                        cmdCr.Parameters.AddWithValue("@vid", voucherId);
                        cmdCr.Parameters.AddWithValue("@sr", srNo++);
                        cmdCr.Parameters.AddWithValue("@aid", creditAccId);
                        cmdCr.Parameters.AddWithValue("@code", creditCode);
                        cmdCr.Parameters.AddWithValue("@name", creditName);
                        cmdCr.Parameters.AddWithValue("@cr", item.DepreciationAmount);
                        cmdCr.Parameters.AddWithValue("@narr", $"Depreciation @ {item.DepreciationRate}% ({item.DepreciationMethod}) on {item.AssetName}");
                        cmdCr.ExecuteNonQuery();
                    }

                    // Record Audit Log in SocAssetDepreciationLog
                    using (var cmdLog = conn.CreateCommand())
                    {
                        cmdLog.Transaction = tx;
                        cmdLog.CommandText = @"
                            INSERT INTO jeevika_erp.SocAssetDepreciationLog
                                (SocietyId, FYId, AssetId, PeriodFrom, PeriodTo,
                                 GrossCost, OpeningWDV, AdditionsDuringYear,
                                 DepreciationRate, DepreciationMethod, DepreciationAmount, NetBookValue,
                                 VoucherId, VoucherNo, CalculatedBy)
                            VALUES
                                (@sid, @fyid, @assetId, @pfrom, @pto,
                                 @gross, @opWdv, @additions,
                                 @rate, @method, @depAmt, @nbv,
                                 @vid, @vno, 'AUTO_ENGINE')";
                        cmdLog.Parameters.AddWithValue("@sid", req.SocietyId);
                        cmdLog.Parameters.AddWithValue("@fyid", resolvedFyId);
                        cmdLog.Parameters.AddWithValue("@assetId", item.AssetId);
                        cmdLog.Parameters.AddWithValue("@pfrom", new DateTime(fyEnd.Year, 4, 1));
                        cmdLog.Parameters.AddWithValue("@pto", fyEnd);
                        cmdLog.Parameters.AddWithValue("@gross", item.TotalGrossCost);
                        cmdLog.Parameters.AddWithValue("@opWdv", item.OpeningWDV);
                        cmdLog.Parameters.AddWithValue("@additions", item.AdditionsDuringYear);
                        cmdLog.Parameters.AddWithValue("@rate", item.DepreciationRate);
                        cmdLog.Parameters.AddWithValue("@method", item.DepreciationMethod);
                        cmdLog.Parameters.AddWithValue("@depAmt", item.DepreciationAmount);
                        cmdLog.Parameters.AddWithValue("@nbv", item.NetBookValue);
                        cmdLog.Parameters.AddWithValue("@vid", voucherId);
                        cmdLog.Parameters.AddWithValue("@vno", voucherNo);
                        cmdLog.ExecuteNonQuery();
                    }
                }

                tx.Commit();

                return Ok(new
                {
                    success = true,
                    message = $"Automated Depreciation successfully posted under Journal Voucher '{voucherNo}'.",
                    voucherId,
                    voucherNo,
                    amount = batch.Summary.TotalDepreciation,
                    assetsProcessed = batch.Results.Count
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to post depreciation voucher: " + ex.Message });
            }
        }

        // ── POST /api/fixed-assets/calculate-net-balance ─────────
        // Single-Click Automation: Recomputes and returns live Net Balance & audit schedule
        [HttpPost("calculate-net-balance")]
        public IActionResult CalculateNetBalance([FromBody] NetBalanceRequest req)
        {
            if (req.SocietyId <= 0)
                return BadRequest(new { success = false, message = "SocietyId is required." });

            try
            {
                var result = ComputeDepreciationBatch(req.SocietyId, req.FYId, req.AsOnDate);
                return Ok(new
                {
                    success = true,
                    message = "Net balance calculated successfully across all fixed assets.",
                    data = result.Results,
                    summary = result.Summary
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to calculate net balance: " + ex.Message });
            }
        }

        // ── GET /api/fixed-assets/report ─────────────────────────
        // Form 31 / Fixed Asset Schedule (Category-wise & Asset-wise report)
        [HttpGet("report")]
        public IActionResult GetAssetReport([FromQuery] int societyId, [FromQuery] int fyId = 0, [FromQuery] string? category = null)
        {
            if (societyId <= 0)
                return BadRequest(new { success = false, message = "SocietyId is required." });

            try
            {
                var batch = ComputeDepreciationBatch(societyId, fyId);
                var filtered = batch.Results;
                if (!string.IsNullOrWhiteSpace(category) && category != "ALL")
                {
                    filtered = filtered.Where(x => x.AssetCategory.Equals(category.Trim(), StringComparison.OrdinalIgnoreCase)).ToList();
                }

                // Group by category
                var categories = filtered.GroupBy(x => x.AssetCategory).Select(g => new
                {
                    categoryName        = g.Key,
                    assets              = g.ToList(),
                    totalOpeningCost    = g.Sum(x => x.OpeningCost),
                    totalAdditions      = g.Sum(x => x.AdditionsDuringYear),
                    totalGrossCost      = g.Sum(x => x.TotalGrossCost),
                    totalOpeningDep     = g.Sum(x => x.OpeningDepreciation),
                    totalCurrentDep     = g.Sum(x => x.DepreciationAmount),
                    totalAccumulatedDep = g.Sum(x => x.TotalAccumulatedDep),
                    totalNetBookValue   = g.Sum(x => x.NetBookValue)
                }).ToList();

                return Ok(new
                {
                    success = true,
                    data = filtered,
                    categoryGroups = categories,
                    summary = batch.Summary
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to generate Fixed Asset Schedule: " + ex.Message });
            }
        }

        // ── Private Calculation Core Engine ──────────────────────
        private static (List<AssetDepreciationItem> Results, AssetSummary Summary) ComputeDepreciationBatch(
            int societyId, int fyId = 0, DateTime? asOnDate = null, NpgsqlConnection? activeConn = null, NpgsqlTransaction? activeTx = null)
        {
            bool closeConn = false;
            NpgsqlConnection conn;
            if (activeConn != null)
            {
                conn = activeConn;
            }
            else
            {
                conn = DbHelper.GetConn();
                closeConn = true;
            }

            try
            {
                // 1. Resolve Financial Year
                DateTime fyStart = new DateTime(DateTime.Today.Year, 4, 1);
                DateTime fyEnd   = asOnDate ?? new DateTime(DateTime.Today.Year + 1, 3, 31);
                string fyLabel   = $"{DateTime.Today.Year}-{(DateTime.Today.Year + 1) % 100:D2}";

                using (var cmdFy = conn.CreateCommand())
                {
                    if (activeTx != null) cmdFy.Transaction = activeTx;
                    if (fyId > 0)
                    {
                        cmdFy.CommandText = "SELECT FYId, FYLabel, StartDate, EndDate FROM jeevika_erp.FinancialYear WHERE SocietyId = @sid AND FYId = @fyid LIMIT 1";
                        cmdFy.Parameters.AddWithValue("@fyid", fyId);
                    }
                    else
                    {
                        cmdFy.CommandText = "SELECT FYId, FYLabel, StartDate, EndDate FROM jeevika_erp.FinancialYear WHERE SocietyId = @sid AND IsActive = TRUE ORDER BY FYId DESC LIMIT 1";
                    }
                    cmdFy.Parameters.AddWithValue("@sid", societyId);
                    using var rFy = cmdFy.ExecuteReader();
                    if (rFy.Read())
                    {
                        fyId = Convert.ToInt32(rFy["FYId"]);
                        fyLabel = rFy["FYLabel"]?.ToString() ?? fyLabel;
                        if (!asOnDate.HasValue && rFy["EndDate"] != DBNull.Value) fyEnd = Convert.ToDateTime(rFy["EndDate"]);
                        if (rFy["StartDate"] != DBNull.Value) fyStart = Convert.ToDateTime(rFy["StartDate"]);
                    }
                }

                // 2. Fetch Assets
                var rawAssets = new List<AssetDepreciationItem>();
                using (var cmd = conn.CreateCommand())
                {
                    if (activeTx != null) cmd.Transaction = activeTx;
                    cmd.CommandText = @"
                        SELECT a.AssetId, a.SocietyId, a.AssetCode, a.AssetName, a.AssetCategory,
                               a.PurchaseDate, a.DepreciationMethod, a.DepreciationRate, a.HalfYearRate,
                               a.UsefulLifeYears, a.OpeningCost, a.OpeningDepreciation,
                               a.MainAccountId, a.AdditionsSubAccountId, a.DepreciationSubAccountId,
                               m.AccCode AS MainAccCode, m.AccName AS MainAccName,
                               addAcc.AccCode AS AddAccCode, addAcc.AccName AS AddAccName,
                               depAcc.AccCode AS DepAccCode, depAcc.AccName AS DepAccName
                        FROM jeevika_erp.SocAsset a
                        LEFT JOIN jeevika_erp.SocAccount m ON a.MainAccountId = m.AccountId
                        LEFT JOIN jeevika_erp.SocAccount addAcc ON a.AdditionsSubAccountId = addAcc.AccountId
                        LEFT JOIN jeevika_erp.SocAccount depAcc ON a.DepreciationSubAccountId = depAcc.AccountId
                        WHERE a.SocietyId = @sid AND a.IsDeleted = FALSE
                        ORDER BY a.AssetCategory ASC, a.AssetCode ASC";
                    cmd.Parameters.AddWithValue("@sid", societyId);

                    using var r = cmd.ExecuteReader();
                    while (r.Read())
                    {
                        rawAssets.Add(new AssetDepreciationItem
                        {
                            AssetId                  = GetIntSafe(r, "AssetId"),
                            SocietyId                = GetIntSafe(r, "SocietyId"),
                            AssetCode                = GetStringSafe(r, "AssetCode"),
                            AssetName                = GetStringSafe(r, "AssetName"),
                            AssetCategory            = GetStringSafe(r, "AssetCategory"),
                            PurchaseDate             = GetDateSafe(r, "PurchaseDate"),
                            DepreciationMethod       = GetStringSafe(r, "DepreciationMethod", "SLM").ToUpper(),
                            DepreciationRate         = GetDecimalSafe(r, "DepreciationRate"),
                            HalfYearRate             = GetDecimalSafe(r, "HalfYearRate"),
                            UsefulLifeYears          = GetIntSafe(r, "UsefulLifeYears"),
                            OpeningCost              = GetDecimalSafe(r, "OpeningCost"),
                            OpeningDepreciation      = GetDecimalSafe(r, "OpeningDepreciation"),
                            MainAccountId            = GetIntSafe(r, "MainAccountId"),
                            MainAccCode              = GetStringSafe(r, "MainAccCode"),
                            MainAccName              = GetStringSafe(r, "MainAccName"),
                            AdditionsSubAccountId    = GetIntSafe(r, "AdditionsSubAccountId"),
                            AddAccCode               = GetStringSafe(r, "AddAccCode"),
                            AddAccName               = GetStringSafe(r, "AddAccName"),
                            DepreciationSubAccountId = GetIntSafe(r, "DepreciationSubAccountId"),
                            DepAccCode               = GetStringSafe(r, "DepAccCode"),
                            DepAccName               = GetStringSafe(r, "DepAccName")
                        });
                    }
                }

                // 3. Compute live calculations per asset
                decimal grandOpCost = 0;
                decimal grandOpDep = 0;
                decimal grandAdditions = 0;
                decimal grandDep = 0;
                decimal grandNet = 0;
                DateTime sep30 = new DateTime(fyStart.Year, 9, 30);

                foreach (var a in rawAssets)
                {
                    // A. Additions from AdditionsSubAccountId vouchers in this FY
                    decimal additions = 0;
                    var additionEntries = new List<(decimal Amt, DateTime Dt)>();

                    var batchTargets = new List<int>();
                    if (a.AdditionsSubAccountId > 0) batchTargets.Add(a.AdditionsSubAccountId);
                    if (a.MainAccountId > 0) batchTargets.Add(a.MainAccountId);

                    if (batchTargets.Count > 0)
                    {
                        using var cmdAdd = conn.CreateCommand();
                        if (activeTx != null) cmdAdd.Transaction = activeTx;
                        var inTargets = string.Join(",", batchTargets);
                        cmdAdd.CommandText = $@"
                            SELECT d.Debit, h.VoucherDate
                            FROM jeevika_erp.SocVoucherDetail d
                            JOIN jeevika_erp.SocVoucherHeader h ON d.VoucherId = h.VoucherId
                            WHERE h.SocietyId = @sid AND h.FYId = @fyid AND d.AccountId IN ({inTargets})
                              AND h.IsDeleted = FALSE AND d.Debit > 0 AND h.VoucherType NOT IN ('OPENING', 'OP')";
                        cmdAdd.Parameters.AddWithValue("@sid", societyId);
                        cmdAdd.Parameters.AddWithValue("@fyid", fyId);

                        using var rAdd = cmdAdd.ExecuteReader();
                        while (rAdd.Read())
                        {
                            decimal amt = Convert.ToDecimal(rAdd["Debit"]);
                            DateTime dt = Convert.ToDateTime(rAdd["VoucherDate"]);
                            additions += amt;
                            additionEntries.Add((amt, dt));
                        }
                    }

                    // B. Depreciation calculation
                    decimal openingWDV = Math.Max(0, a.OpeningCost - a.OpeningDepreciation);
                    decimal baseOpening = a.DepreciationMethod == "WDV" ? openingWDV : a.OpeningCost;
                    decimal depOnOpening = Math.Round(baseOpening * (a.DepreciationRate / 100m), 2);

                    decimal depOnAdditions = 0;
                    foreach (var add in additionEntries)
                    {
                        decimal effectiveRate = add.Dt <= sep30 
                            ? a.DepreciationRate 
                            : (a.HalfYearRate > 0 ? a.HalfYearRate : Math.Round(a.DepreciationRate * 0.5m, 2));
                        depOnAdditions += Math.Round(add.Amt * (effectiveRate / 100m), 2);
                    }

                    decimal totalCurrentDep = depOnOpening + depOnAdditions;
                    decimal totalGross = a.OpeningCost + additions;
                    decimal totalAccDep = a.OpeningDepreciation + totalCurrentDep;
                    decimal netBookValue = Math.Max(0, totalGross - totalAccDep);

                    a.OpeningWDV           = openingWDV;
                    a.AdditionsDuringYear  = additions;
                    a.DepreciationAmount   = totalCurrentDep;
                    a.TotalGrossCost       = totalGross;
                    a.TotalAccumulatedDep  = totalAccDep;
                    a.NetBookValue         = netBookValue;

                    grandOpCost   += a.OpeningCost;
                    grandOpDep    += a.OpeningDepreciation;
                    grandAdditions += additions;
                    grandDep      += totalCurrentDep;
                    grandNet      += netBookValue;
                }

                var summary = new AssetSummary
                {
                    TotalAssets       = rawAssets.Count,
                    TotalOpeningCost  = grandOpCost,
                    TotalOpeningDep   = grandOpDep,
                    TotalOpeningWDV   = grandOpCost - grandOpDep,
                    TotalAdditions    = grandAdditions,
                    TotalDepreciation = grandDep,
                    TotalNetBookValue = grandNet
                };

                return (rawAssets, summary);
            }
            finally
            {
                if (closeConn) conn.Dispose();
            }
        }
    }

    // ── Supporting Data Models ───────────────────────────────────
    public class AssetCreateModel
    {
        public int       SocietyId                { get; set; }
        public string?   AssetCode                { get; set; }
        public string    AssetName                { get; set; } = "";
        public string    AssetCategory            { get; set; } = "Computer & Equipment";
        public DateTime? PurchaseDate             { get; set; }
        public string    DepreciationMethod       { get; set; } = "SLM";
        public decimal   DepreciationRate         { get; set; } = 0m;
        public decimal   HalfYearRate             { get; set; } = 0m;
        public int       UsefulLifeYears          { get; set; } = 0;
        public decimal   OpeningCost              { get; set; } = 0m;
        public decimal   OpeningDepreciation      { get; set; } = 0m;
        public int?      MainAccountId            { get; set; }
        public int?      AdditionsSubAccountId    { get; set; }
        public int?      DepreciationSubAccountId { get; set; }
        public string?   Remarks                  { get; set; }
    }

    public class DepreciationCalculationRequest
    {
        public int       SocietyId { get; set; }
        public int       FYId      { get; set; } = 0;
        public DateTime? PeriodTo  { get; set; }
    }

    public class DepreciationPostRequest
    {
        public int       SocietyId   { get; set; }
        public int       FYId        { get; set; } = 0;
        public DateTime? VoucherDate { get; set; }
        public bool      Overwrite   { get; set; } = false;
    }

    public class NetBalanceRequest
    {
        public int       SocietyId { get; set; }
        public int       FYId      { get; set; } = 0;
        public DateTime? AsOnDate  { get; set; }
    }

    public class AssetDepreciationItem
    {
        public int       AssetId                  { get; set; }
        public int       SocietyId                { get; set; }
        public string    AssetCode                { get; set; } = "";
        public string    AssetName                { get; set; } = "";
        public string    AssetCategory            { get; set; } = "";
        public DateTime? PurchaseDate             { get; set; }
        public string    DepreciationMethod       { get; set; } = "SLM";
        public decimal   DepreciationRate         { get; set; } = 0m;
        public decimal   HalfYearRate             { get; set; } = 0m;
        public int       UsefulLifeYears          { get; set; } = 0;
        public decimal   OpeningCost              { get; set; } = 0m;
        public decimal   OpeningDepreciation      { get; set; } = 0m;
        public decimal   OpeningWDV               { get; set; } = 0m;
        public decimal   AdditionsDuringYear      { get; set; } = 0m;
        public decimal   DepreciationAmount       { get; set; } = 0m;
        public decimal   TotalGrossCost           { get; set; } = 0m;
        public decimal   TotalAccumulatedDep      { get; set; } = 0m;
        public decimal   NetBookValue             { get; set; } = 0m;
        public int       MainAccountId            { get; set; }
        public string    MainAccCode              { get; set; } = "";
        public string    MainAccName              { get; set; } = "";
        public int       AdditionsSubAccountId    { get; set; }
        public string    AddAccCode               { get; set; } = "";
        public string    AddAccName               { get; set; } = "";
        public int       DepreciationSubAccountId { get; set; }
        public string    DepAccCode               { get; set; } = "";
        public string    DepAccName               { get; set; } = "";
    }

    public class AssetSummary
    {
        public int     TotalAssets       { get; set; }
        public decimal TotalOpeningCost  { get; set; }
        public decimal TotalOpeningDep   { get; set; }
        public decimal TotalOpeningWDV   { get; set; }
        public decimal TotalAdditions    { get; set; }
        public decimal TotalDepreciation { get; set; }
        public decimal TotalNetBookValue { get; set; }
    }
}
