// Initial fleet data extracted from sample/fleetdata.png.
// Boeings (OY-ASD/ASE/ASF/ASG) are intentionally excluded — managed elsewhere.
// Only tailNumber + model are stored per the agreed master-data shape.
export const FLEET_SEED: ReadonlyArray<{ tailNumber: string; model: string }> =
  [
    { tailNumber: "OY-BUF", model: "C172M" },
    { tailNumber: "OY-CAC", model: "P.68" },
    { tailNumber: "OY-CAH", model: "TB-10" },
    { tailNumber: "OY-CAT", model: "BN2B-26 Islander" },
    { tailNumber: "OY-CDB", model: "TB-20" },
    { tailNumber: "OY-CDC", model: "P.68" },
    { tailNumber: "OY-CDJ", model: "TB-9" },
    { tailNumber: "OY-CDL", model: "TB-9" },
    { tailNumber: "OY-CDP", model: "TB-9" },
    { tailNumber: "OY-CDR", model: "TB-10" },
    { tailNumber: "OY-CDT", model: "TB-20" },
    { tailNumber: "OY-CDU", model: "TB-9" },
    { tailNumber: "OY-CVW", model: "King Air 350" },
    { tailNumber: "OY-GSA", model: "PC-12" },
    { tailNumber: "OY-GSB", model: "PC-12/47" },
    { tailNumber: "OY-HHG", model: "R44" },
    { tailNumber: "OY-LKI", model: "P.68" },
    { tailNumber: "OY-OCM", model: "P.68" },
    { tailNumber: "OY-SUR", model: "P.68 Observer" },
    { tailNumber: "OY-TWM", model: "PC-12/47E" },
  ];
