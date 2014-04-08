open Core.Std

let () =
    let dataset = Dataset.find_recent () in
    let dsuk = Uk.create (Dataset.dstime dataset) in
    Uk.copy_from_dataset dsuk dataset
