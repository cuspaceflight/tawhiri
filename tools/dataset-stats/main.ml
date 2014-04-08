open Core.Std

let () =
    let dataset = Dataset.find_recent () in
    let stats = Stats.analyse dataset |> Stats.to_table |> Table.to_string in
    let filename = Time.format (Dataset.dstime dataset) "%Y%m%d%H.stats" in
    Out_channel.with_file filename ~f:(fun file -> Out_channel.output_string file stats)
