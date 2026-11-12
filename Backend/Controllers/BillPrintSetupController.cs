// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — BillPrintSetupController
// Endpoints for managing Bill Print Layout settings per Society
// Supports 4 Formats: GST_DETAILED, GST_RECEIPT, NON_GST, MARATHI
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json.Serialization;
using Npgsql;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/bill-print-setup")]
    [AllowAnonymous]
    public class BillPrintSetupController : ControllerBase
    {
        public class BillPrintSetupDto
        {
            [JsonPropertyName("societyId")]
            public int SocietyId { get; set; } = 1;

            [JsonPropertyName("format")]
            public string Format { get; set; } = "GST_DETAILED";

            [JsonPropertyName("heading")]
            public string Heading { get; set; } = "TAX INVOICE";

            [JsonPropertyName("bldg")]
            public bool Bldg { get; set; } = true;

            [JsonPropertyName("srno")]
            public bool Srno { get; set; } = true;

            [JsonPropertyName("newpage")]
            public bool Newpage { get; set; } = false;

            [JsonPropertyName("arrears")]
            public bool Arrears { get; set; } = true;

            [JsonPropertyName("receipt")]
            public bool Receipt { get; set; } = false;

            [JsonPropertyName("blankhead")]
            public bool Blankhead { get; set; } = false;

            [JsonPropertyName("qr")]
            public string Qr { get; set; } = "upi";

            [JsonPropertyName("sign")]
            public string Sign { get; set; } = "sig";
        }

        private static void EnsureTable(NpgsqlConnection conn)
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                CREATE TABLE IF NOT EXISTS jeevika_erp.socbillprintsetup (
                    SetupId SERIAL PRIMARY KEY,
                    SocietyId INT NOT NULL,
                    FormatKey VARCHAR(50) NOT NULL DEFAULT 'GST_DETAILED',
                    Heading VARCHAR(255) DEFAULT 'TAX INVOICE',
                    PrintBldg BOOLEAN DEFAULT TRUE,
                    ShowSrNo BOOLEAN DEFAULT TRUE,
                    NewPage BOOLEAN DEFAULT FALSE,
                    ShowArrears BOOLEAN DEFAULT TRUE,
                    ShowReceipt BOOLEAN DEFAULT FALSE,
                    BlankHead BOOLEAN DEFAULT FALSE,
                    QrCode VARCHAR(50) DEFAULT 'upi',
                    SignType VARCHAR(50) DEFAULT 'sig',
                    UpdatedAt TIMESTAMPTZ DEFAULT NOW(),
                    CONSTRAINT uidx_socbillprintsetup_soc UNIQUE (SocietyId)
                );";
            cmd.ExecuteNonQuery();
        }

        [HttpGet]
        public IActionResult GetConfig([FromQuery] int? societyId)
        {
            int sid = societyId ?? 1;
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureTable(conn);

                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT SocietyId, FormatKey, Heading, PrintBldg, ShowSrNo, NewPage, 
                           ShowArrears, ShowReceipt, BlankHead, QrCode, SignType
                    FROM jeevika_erp.socbillprintsetup
                    WHERE SocietyId = @sid";
                cmd.Parameters.AddWithValue("@sid", sid);

                using var r = cmd.ExecuteReader();
                if (r.Read())
                {
                    return Ok(new BillPrintSetupDto
                    {
                        SocietyId = Convert.ToInt32(r["SocietyId"]),
                        Format = r["FormatKey"]?.ToString() ?? "GST_DETAILED",
                        Heading = r["Heading"]?.ToString() ?? "TAX INVOICE",
                        Bldg = Convert.ToBoolean(r["PrintBldg"]),
                        Srno = Convert.ToBoolean(r["ShowSrNo"]),
                        Newpage = Convert.ToBoolean(r["NewPage"]),
                        Arrears = Convert.ToBoolean(r["ShowArrears"]),
                        Receipt = Convert.ToBoolean(r["ShowReceipt"]),
                        Blankhead = Convert.ToBoolean(r["BlankHead"]),
                        Qr = r["QrCode"]?.ToString() ?? "upi",
                        Sign = r["SignType"]?.ToString() ?? "sig"
                    });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[BillPrintSetup] DB read error: {ex.Message}");
            }

            // Fallback default
            return Ok(new BillPrintSetupDto
            {
                SocietyId = sid,
                Format = "GST_DETAILED",
                Heading = "TAX INVOICE",
                Bldg = true,
                Srno = true,
                Newpage = false,
                Arrears = true,
                Receipt = false,
                Blankhead = false,
                Qr = "upi",
                Sign = "sig"
            });
        }

        [HttpPost]
        public IActionResult SaveConfig([FromBody] BillPrintSetupDto dto)
        {
            if (dto == null) return BadRequest("Invalid configuration payload");
            if (dto.SocietyId <= 0) dto.SocietyId = 1;

            try
            {
                using var conn = DbHelper.GetConn();
                EnsureTable(conn);

                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    INSERT INTO jeevika_erp.socbillprintsetup
                        (SocietyId, FormatKey, Heading, PrintBldg, ShowSrNo, NewPage, 
                         ShowArrears, ShowReceipt, BlankHead, QrCode, SignType, UpdatedAt)
                    VALUES
                        (@sid, @fmt, @head, @bldg, @srno, @newpage, 
                         @arrears, @receipt, @blankhead, @qr, @sign, NOW())
                    ON CONFLICT (SocietyId) DO UPDATE SET
                        FormatKey = EXCLUDED.FormatKey,
                        Heading = EXCLUDED.Heading,
                        PrintBldg = EXCLUDED.PrintBldg,
                        ShowSrNo = EXCLUDED.ShowSrNo,
                        NewPage = EXCLUDED.NewPage,
                        ShowArrears = EXCLUDED.ShowArrears,
                        ShowReceipt = EXCLUDED.ShowReceipt,
                        BlankHead = EXCLUDED.BlankHead,
                        QrCode = EXCLUDED.QrCode,
                        SignType = EXCLUDED.SignType,
                        UpdatedAt = NOW();";

                cmd.Parameters.AddWithValue("@sid", dto.SocietyId);
                cmd.Parameters.AddWithValue("@fmt", dto.Format ?? "GST_DETAILED");
                cmd.Parameters.AddWithValue("@head", dto.Heading ?? "MAINTENANCE BILL");
                cmd.Parameters.AddWithValue("@bldg", dto.Bldg);
                cmd.Parameters.AddWithValue("@srno", dto.Srno);
                cmd.Parameters.AddWithValue("@newpage", dto.Newpage);
                cmd.Parameters.AddWithValue("@arrears", dto.Arrears);
                cmd.Parameters.AddWithValue("@receipt", dto.Receipt);
                cmd.Parameters.AddWithValue("@blankhead", dto.Blankhead);
                cmd.Parameters.AddWithValue("@qr", dto.Qr ?? "upi");
                cmd.Parameters.AddWithValue("@sign", dto.Sign ?? "sig");

                cmd.ExecuteNonQuery();

                return Ok(new { success = true, message = "Bill print layout configuration saved successfully.", config = dto });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[BillPrintSetup] DB save error: {ex.Message}");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }
}
